import { decodeHTML } from "entities";
import { sql } from "@aihot/backend/db";
import { geoTranslationGlossary, geoTranslationIssues, normalizeGeoTranslation, GEO_TRANSLATION_VERSION, PERPLEXITY_STATISTICAL_CONTEXT, type GeoTranslationText } from "../../../industry/translation.ts";
import { translationHash, translationPercentages } from "./translate-public.ts";

export const TRANSLATION_AUDIT_VERSION = 1;
export interface AuditFinding {
  code: string; field: "title" | "summary"; confidence: "high" | "review";
  action: "cache-repair" | "review"; sourceEvidence: string; translatedEvidence: string; explanation: string;
}
const withoutUrls = (text: string) => decodeHTML(text).normalize("NFKC").replace(/\\+%/gu,"%").replace(/https?:\/\/\s+[^#\n]+|https?:\/\/[^\s<>"“”]+|`[^`\n]+`/giu," ");
const zhNegative = /不|没|无|未|并非|缺乏|缺少|尚无|尚未|无法|不能|无需|难以|零|免去|免于/u;
const sourceNegative = /\b(?:not|never|without|cannot|can't|doesn't|don't|isn't|aren't|won't|no (?:clicks?|data|evidence|increase|change|effect|guarantee))\b|\b(?:sans|aucun|aucune|toujours pas|ne .{0,35} pas|nicht|keine?|ohne|sin|ningún)\b|ない|ありません|않|없/iu;
const sourceResearch = /\b(?:evaluat\w*|benchmark|ROC|AUC|class(?:es|ification)?|scor(?:e|ing)|model)\b/iu;

function quantity(value: string, unit = "", language = "en"): number {
  let number = value.replaceAll(" ","");
  if (number.includes(",") && number.includes(".")) number=number.lastIndexOf(",")>number.lastIndexOf(".")?number.replaceAll(".","").replace(",","."):number.replaceAll(",","");
  else if (number.includes(",")) number=/^\d{1,3}(?:,\d{3})+$/.test(number)?number.replaceAll(",",""):number.replace(",",".");
  else if (language === "de" && /^\d{1,3}(?:\.\d{3})+$/.test(number)) number=number.replaceAll(".","");
  const multiplier:Record<string,number>={k:1e3,m:1e6,b:1e9,thousand:1e3,million:1e6,billion:1e9,千:1e3,万:1e4,百万:1e6,千万:1e7,亿:1e8,十亿:1e9};
  return Number((Number(number)*(multiplier[unit.toLowerCase().replace(/s$/u,"")]??1)).toPrecision(15));
}
function chineseInteger(value:string):number|null {
  if(!value||!/^[零〇一二两三四五六七八九十百千万亿]+$/u.test(value))return null;
  const digits:Record<string,number>={零:0,〇:0,一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9};
  if(!/[十百千万亿]/u.test(value))return Number([...value].map(c=>digits[c]).join(""));
  let total=0,section=0,n=0;
  for(const char of value){if(char in digits){n=digits[char];continue;}const unit=({十:10,百:100,千:1000,万:10000,亿:1e8} as Record<string,number>)[char];if(unit<10000){section+=(n||1)*unit;n=0;}else{total+=(section+n||1)*unit;section=0;n=0;}}
  return total+section+n;
}
/** Advisory only. Accept common Chinese magnitude conversions; do not compare model versions or URLs. */
export function auditNumberValues(text:string,language="en"):number[] {
  const clean=normalizeProportions(withoutUrls(text),language).replace(/\b(?:GPT|Claude|Gemini|Qwen|Llama|DeepSeek)[- ]?\d+(?:[.\-]\d+)*(?:[a-z])?\b/giu," ").replace(/\b((?:19|20)\d{2})-(\d{1,2})-(\d{1,2})\b/g,"$1 $2 $3").replace(/(?<=[A-Za-z])-(?=\d)/gu," ");
  const values=[...clean.matchAll(/(?<![\d_])([+-]?\d+(?:[.,]\d+)*)(?:\s*(thousands?\b|millions?\b|billions?\b|[kmb]\b|十亿|千万|百万|亿|万|千))?/giu)].map(m=>quantity(m[1],m[2],language));
  for(const m of clean.matchAll(/(?<![\d.])([零〇一二两三四五六七八九十百千万亿]+)(?=[个项种条次年月日天号位人名家大集屏步轮类款篇倍分之强级]|\s*[%％])|(?:第|前)([零〇一二两三四五六七八九十百千万亿]+)/gu)){const value=chineseInteger(m[1]??m[2]);if(value!==null)values.push(value);}
  for(const m of clean.matchAll(/([零〇一二两三四五六七八九十]+)年半/gu)){const value=chineseInteger(m[1]);if(value!==null)values.push(value+0.5);}
  for(const m of clean.matchAll(/[零〇一二两三四五六七八九十百]+分之([零〇一二两三四五六七八九十百]+)/gu)){const value=chineseInteger(m[1]);if(value!==null)values.push(value);}
  return values.filter(Number.isFinite).sort((a,b)=>a-b);
}

// Japanese 割 denotes tenths (5割 = 50%), not the literal numeral 5. This is audit-only.
function normalizeProportions(text:string,language:string){
  if(language==='ja')return text.replace(/(\d+(?:\.\d+)?)割(?:([0-9])分)?/gu,(_all,n,decimal)=>`${Number(n)*10+Number(decimal??0)}%`);
  if(language==='zh')return text.replace(/([0-9]+(?:\.[0-9]+)?|[一二两三四五六七八九十]+)成/gu,(_all,n)=>`${(chineseInteger(n)??Number(n))*10}%`);
  return text;
}

/** Signals are intentionally separate from publication guards: ambiguous semantics never auto-requeue. */
export function auditTranslationText(input:GeoTranslationText & {language?:string},output:GeoTranslationText):AuditFinding[] {
  const findings:AuditFinding[]=[];
  const normalized=normalizeGeoTranslation(input,output);
  const context=withoutUrls(input.title+"\n"+(input.summary??""));
  if(!input.summary?.trim()&&output.summary?.trim())findings.push({code:"unexpected-summary",field:"summary",confidence:"high",action:"review",sourceEvidence:input.summary??"",translatedEvidence:output.summary,explanation:"原文无摘要却存在译文摘要；应核对版本及来源，不允许从标题补写。"});
  for(const field of ["title","summary"] as const){
    const original=input[field],translated=output[field];
    if(!original||!translated)continue;
    const source=withoutUrls(original),target=withoutUrls(translated);
    const add=(code:string,sourceEvidence:string,translatedEvidence:string,explanation:string,confidence:"high"|"review"="review",action:"cache-repair"|"review"="review")=>findings.push({code,field,confidence,action,sourceEvidence,translatedEvidence,explanation});
    if(normalized[field]!==translated){
      const terms=geoTranslationGlossary(original,context).filter(term=>term.mistranslations.some(value=>translated.includes(value))&&!term.translationExclude?.test(translated));
      add("terminology",terms.map(term=>term.id+": "+(original.match(term.source)?.[0]??"")).join("; "),translated,"原文条件满足已核验术语修复规则；候选译文保存在 proposedNormalization。","high","cache-repair");
    }
    for(const issue of geoTranslationIssues({title:source,summary:null},{title:target,summary:null}))add(issue,source,target,"已有确定性发布检查命中；需按当前原文核对后重译。","high");
    if(sourceResearch.test(context)&&/\bpopulations?\b/iu.test(source)&&/人群|人口/u.test(target))add("population-context",source.match(/\bpopulations?\b/iu)![0],target.match(/.{0,25}(?:人群|人口).{0,30}/u)![0],"研究中的 population 可能指样本集合；也可能确实研究人群，禁止自动替换。");
    if(sourceResearch.test(context)&&/\bdiscrimination\b/iu.test(source)&&/歧视/u.test(target))add("discrimination-context","discrimination",target.match(/.{0,25}歧视.{0,30}/u)![0],"检查是否为 ROC-AUC 等意义上的区分能力；公平性研究中的歧视是正确译法。");
    if(/\bperplexity\b/iu.test(source)&&PERPLEXITY_STATISTICAL_CONTEXT.test(context)&&/\bPerplexity\b/iu.test(target))add("perplexity-statistics",source.match(/.{0,35}perplexity.{0,45}/iu)![0],target,"原文可能指模型困惑度等统计量；也可能同时提到 Perplexity 产品。仅人工复核，不能反向替换已保护品牌。");
    if(/(?<![\p{L}\p{N}_])GEO(?![\p{L}\p{N}_])/u.test(source)&&/地理(?!解)/u.test(target)&&!/(?:geograph|geospatial|geolocat|geograf|géograph|地理)/iu.test(context))add("geo-acronym","GEO",target.match(/.{0,20}地理(?!解).{0,20}/u)![0],"GEO 缩写可能被误当作地理；缺少明确 AI/搜索上下文时仅报告，不自动替换。");
    if(/\bsearch goods\b/iu.test(source)&&/搜索商品|搜索货物/u.test(target))add("search-goods-context","search goods",target.match(/搜索商品|搜索货物/u)![0],"检查是否经济学的搜寻品；商品搜索动作不能全局替换。");
    if(/\b(?:cited by|cited in|cited sources|sites cited)\b/iu.test(source)&&!/被引用|获(?:得)?引用|引用来源|被[^。！？.!?]{0,120}引用/u.test(target)&&/引用/u.test(target))add("citation-direction",source.match(/\b(?:cited by|cited in|cited sources|sites cited)\b/iu)![0],target,"检查引用者与被引用者；中文主动改写也可能正确，因此只报告。");
    if(sourceNegative.test(source)&&!zhNegative.test(target)&&!/\bnot only\b/iu.test(source))add("negation-review",source.match(sourceNegative)![0],target,"原文有否定线索，但未找到常见中文对应；需人工检查，不以关键词缺失直接判错。");
    const comparative=/(?:[+-]?\d+(?:[.,]\d+)?\s*%\s+(?:more|fewer|less|higher|lower)|\b(?:increase(?:d)?|decrease(?:d)?|grew|fell|dropped|more than|less than)\b[^.!?;%]{0,20}\d+(?:[.,]\d+)?\s*%)/iu.exec(source);
    if(comparative&&!/(?:增|降|升|减|多|少|高|低|超|更|倍|上涨|下跌|不足|不及)/u.test(target))add("comparison-review",comparative[0],target,"数字可能保留但比较关系遗漏；需确认原文是否只是提出问题或引用他人说法。");
    if(/percentage[- ]points?/iu.test(source)&&!/(?:百分点|百分之.{0,8}点)/u.test(target)||!/(?:percentage[- ]points?|\bpp\b)/iu.test(source)&&/个百分点/u.test(target))add("percentage-point-review",source,target,"核对相对百分比与百分点；译文可能对多组比例作了额外计算，不能自动改单位。");
    const originalPercentages=translationPercentages(normalizeProportions(source,input.language??"en")),targetPercentages=translationPercentages(normalizeProportions(target,"zh"));
    // Chinese words such as 百分之二十五 need human checking rather than an automatic numeric failure.
    if(JSON.stringify(originalPercentages)!==JSON.stringify(targetPercentages)&&!/百分之[零〇一二两三四五六七八九十百]/u.test(target))add("percentage-values",JSON.stringify(originalPercentages),JSON.stringify(targetPercentages),"原文与译文的数值百分比集合不同，含遗漏或额外百分比；保留重复值和正负号以便复核。","high");
    const sourceValues=auditNumberValues(source,input.language),targetValues=auditNumberValues(target,"zh");
    const missing=sourceValues.filter(value=>!targetValues.some(other=>Math.abs(other-value)<=Math.max(1e-8,Math.abs(value)*1e-10)));
    if(missing.length)add("number-review",JSON.stringify(missing),JSON.stringify(targetValues),"部分数字未找到等值中文写法；日期、数字读法与断句仍可能合法，只报告，不自动拦截或重译。");
    if(/(?:Read more|The post .{1,900} appeared first on|L[’']article .{1,900} a été publié sur)/iu.test(source)&&/(?:阅读更多|了解更多|本文首次|文章首次|首次出现|首次发表)/u.test(target))add("navigation-tail",source.slice(-300),target.slice(-300),"原文仍含来源导航模板；应先核对采集摘要，不通过译文补写或盲删正文。");
  }
  return findings;
}

/** Administrative snapshot. No model/network requests or writes, and no public route. */
export async function auditCachedTranslations(){
  const rows=await sql<Array<{id:string;source_id:string;url:string;title:string;summary:string|null;language:string;summary_version:number;
    content_hash:string;title_zh:string;summary_zh:string|null;provider:string;updated_at:Date;reviewed_id:string|null;reviewed_title:string|null;reviewed_summary:string|null}>>`
    SELECT i.id,i.source_id,i.url,i.title,i.summary,i.language,i.summary_version,t.content_hash,t.title_zh,t.summary_zh,t.provider,t.updated_at,
      c.id::text AS reviewed_id,c.title_zh AS reviewed_title,c.summary_zh AS reviewed_summary
    FROM geo_public_items i JOIN geo_public_source_status s ON s.source_id=i.source_id AND s.enabled
    JOIN geo_public_translations t ON t.item_id=i.id AND t.status='done'
      AND (t.title_original,t.summary_original,t.language_original) IS NOT DISTINCT FROM (i.title,i.summary,i.language)
      AND nullif(btrim(t.title_zh),'') IS NOT NULL AND (nullif(btrim(i.summary),'') IS NULL OR nullif(btrim(t.summary_zh),'') IS NOT NULL)
    LEFT JOIN LATERAL(SELECT id,title_zh,summary_zh FROM geo_translation_corrections WHERE item_id=i.id AND status='applied'
      AND (title_original,summary_original,language_original) IS NOT DISTINCT FROM (i.title,i.summary,i.language)
      ORDER BY reviewed_at DESC,id DESC LIMIT 1)c ON true
    WHERE i.language NOT IN ('zh','zh-CN','zh-TW') ORDER BY i.source_id,i.id`;
  const records=rows.map(row=>{
    const original={title:row.title,summary:row.summary,language:row.language};
    const machine={title:row.title_zh,summary:row.summary_zh};
    const reviewed=row.reviewed_id?{title:row.reviewed_title!,summary:row.reviewed_summary}:null;
    return {itemId:row.id,sourceId:row.source_id,url:row.url,original,summaryVersion:row.summary_version,contentHash:row.content_hash,
      expectedContentHash:translationHash({id:row.id,...original}),machine:{...machine,provider:row.provider,updatedAt:row.updated_at.toISOString()},
      reviewed:reviewed?{id:row.reviewed_id,...reviewed}:null,machineFindings:auditTranslationText(original,machine),
      visibleFindings:auditTranslationText(original,reviewed??machine),proposedNormalization:normalizeGeoTranslation(original,machine)};
  });
  const byCode:Record<string,number>={},byLanguage:Record<string,number>={};
  for(const row of records){byLanguage[row.original.language]=(byLanguage[row.original.language]??0)+1;for(const code of new Set(row.visibleFindings.map(finding=>finding.code)))byCode[code]=(byCode[code]??0)+1;}
  return {auditVersion:TRANSLATION_AUDIT_VERSION,glossaryVersion:GEO_TRANSLATION_VERSION,createdAt:new Date().toISOString(),readOnly:true,
    totals:{examined:records.length,visibleFlagged:records.filter(row=>row.visibleFindings.length).length,machineFlagged:records.filter(row=>row.machineFindings.length).length,
      reviewedOverlays:records.filter(row=>row.reviewed).length,repairableUnreviewed:records.filter(row=>!row.reviewed&&!/^geo-edited-/.test(row.machine.provider)&&row.visibleFindings.some(f=>f.action==="cache-repair")).length,hashMismatches:records.filter(row=>row.contentHash!==row.expectedContentHash).length,byCode,byLanguage},records};
}
