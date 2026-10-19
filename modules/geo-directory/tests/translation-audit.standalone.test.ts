import test from "node:test";
import assert from "node:assert/strict";
import {auditNumberValues,auditTranslationText} from "../backend/audit-translations.ts";
import {normalizeGeoTranslation} from "../../../industry/translation.ts";
import {repairCachedTranslations} from "../backend/repair-translations.ts";
import {translationHash} from "../backend/translate-public.ts";
const text=(title:string,summary:string|null=null)=>({title,summary});

test("Google Search spam policies use the search term, without rewriting Gmail or literal text",()=>{
 const input=text("Clarifying that spam policies apply to generative AI responses in Google Search");
 const output=text("澄清垃圾邮件政策适用于 Google 搜索中的生成式 AI 回应");
 const fixed=normalizeGeoTranslation(input,output);
 assert.equal(fixed.title,"澄清垃圾内容政策适用于 Google 搜索中的生成式 AI 回应");
 assert.deepEqual(normalizeGeoTranslation(input,fixed),fixed);
 for(const original of ["Gmail spam policy for inboxes", "Google Search and Gmail spam policies", "Spam policy for an email provider"])
  assert.equal(normalizeGeoTranslation(text(original),text("垃圾邮件政策")).title,"垃圾邮件政策");
 const correct=text("Google 搜索垃圾内容政策"); assert.deepEqual(normalizeGeoTranslation(input,correct),correct);
 const literal=text("`垃圾邮件政策` https://example.com/垃圾邮件政策"); assert.deepEqual(normalizeGeoTranslation(input,literal),literal);
});

test("a reference cannot invent a summary when the original has none; rejection happens before database access",async()=>{
 for(const summary of [null,"", "   "]){
  const original={id:"a".repeat(64),title:"AI search",summary,language:"en"};
  await assert.rejects(repairCachedTranslations({references:[{itemId:original.id,contentHash:translationHash(original),originalTitle:original.title,originalSummary:summary,originalLanguage:"en",referenceTitle:"AI 搜索",referenceSummary:"原文不存在的摘要",publishable:true}]}),/Invalid translation reference/);
 }
});

test("new glossary repairs only Google search spam updates and evidenced agentic phrases",()=>{
 const input=text("Google June 2026 Spam Update","Agentic System for Generative Engine Optimization");
 const output=text("Google 2026年6月垃圾邮件更新","用于生成式引擎优化的代理系统");
 const fixed=normalizeGeoTranslation(input,output);assert.equal(fixed.title,"Google 2026年6月垃圾内容更新");assert.equal(fixed.summary,"用于生成式引擎优化的智能体系统");assert.deepEqual(normalizeGeoTranslation(input,fixed),fixed);
 assert.equal(normalizeGeoTranslation(text("An agentic GEO system uses LLM feedback."),text("一种具有代理特性的 GEO 系统使用 LLM 反馈。")).title,"一种具有智能体特性的 GEO 系统使用 LLM 反馈。");
 for(const [original,translated] of [["Google Gmail spam update for email inboxes","Google Gmail垃圾邮件更新"],["An AI proxy system","AI代理系统"],["Agentic system for GEO","GEO智能代理系统"],["Society uses agentic psychology","社会使用代理系统"]])assert.equal(normalizeGeoTranslation(text(original),text(translated)).title,translated);
 const protectedValue="垃圾邮件更新 https://example.com/垃圾邮件更新 `垃圾邮件更新` @垃圾邮件更新 2026";
 const protectedResult=normalizeGeoTranslation(text("Google spam update 2026"),text(protectedValue)).title;
 assert.equal(protectedResult,"垃圾内容更新 https://example.com/垃圾邮件更新 `垃圾邮件更新` @垃圾邮件更新 2026");
});
test("research and citation direction are advisory and never automatically rewritten",()=>{
 const original=text("Evaluating models","Different populations: Comparing rankings separates population differences from discrimination. Search goods are a robustness check.");
 const translated=text("评估模型","不同人群：比较排名将人口差异与歧视分开。搜索商品用于稳健性检查。");
 const findings=auditTranslationText(original,translated);assert.ok(findings.some(f=>f.code==="population-context"));assert.ok(findings.some(f=>f.code==="discrimination-context"));assert.ok(findings.some(f=>f.code==="search-goods-context"));assert.ok(findings.every(f=>f.action==="review"));assert.deepEqual(normalizeGeoTranslation(original,translated),translated);
 assert.ok(auditTranslationText(text("Our site is cited by Google AI."),text("我们的网站引用Google AI。")).some(f=>f.code==="citation-direction"));
 assert.ok(!auditTranslationText(text("Our site is cited by Google AI."),text("我们的网站被Google AI引用。")).some(f=>f.code==="citation-direction"));
 assert.ok(!auditTranslationText(text("The population experiences discrimination."),text("人口遭遇歧视。")).some(f=>/context/.test(f.code)));
 assert.ok(auditTranslationText(text("Les agences GEO à Paris"),text("巴黎地理机构")).some(f=>f.code==='geo-acronym'));
 assert.ok(!auditTranslationText(text("Geography and GEO location"),text("地理位置")).some(f=>f.code==='geo-acronym'));
 assert.ok(!auditTranslationText(text("Understand AEO/GEO myths better"),text("更好地理解 AEO/GEO 的误区")).some(f=>f.code==='geo-acronym'));
});
test("perplexity metrics remain a statistical term, including actual GEO-Bench and GEO Defender wording",()=>{
 const bench=text("GEO-Bench: Benchmarking Ranking Manipulation in Generative Engine Optimization","We score every method on five datasets against a fixed open-weight ranker (Llama-3.1-8B-Instruct), using metrics for both effectiveness (NRG, Success@α, Promote@α) and stealth (keyword violation rate, perplexity ratio).");
 const defender=text("When Optimization Becomes Manipulation: Defending Generative Search against Malicious Generative Engine Optimization","However, defending against such manipulation poses two major challenges: attack documents remain factually consistent with their originals, rendering fact verification and perplexity filtering ineffective, and the features they amplify equally characterize high-quality benign content.");
 for(const [input,output] of [[bench,text("GEO-Bench 基准","评估有效性和隐蔽性指标，包括关键词违规率和困惑度比率。")],[defender,text("防御生成式搜索操纵","攻击文档与原文事实一致，使事实核验和困惑度过滤失效。")]])assert.deepEqual(normalizeGeoTranslation(input,output),output);
 const mixed=text("Perplexity search and model evaluation","Perplexity is a search product; model perplexity scores measure prediction uncertainty.");
 const correct=text("Perplexity 搜索与模型评估","Perplexity 是搜索产品；模型困惑度分数衡量预测不确定性。");assert.deepEqual(normalizeGeoTranslation(mixed,correct),correct);
 assert.equal(normalizeGeoTranslation(text("Perplexity AI search retrieves sources"),text("困惑度AI搜索检索来源")).title,"PerplexityAI搜索检索来源");
 assert.ok(auditTranslationText(bench,text("GEO-Bench 基准","使用 Perplexity 比率衡量隐蔽性")).some(f=>f.code==='perplexity-statistics'));
});
test("number audits allow localized magnitudes, Chinese counts and model versions",()=>{
 assert.deepEqual(auditNumberValues("100,000 queries, 66.6 million responses, GPT-5.6"),[100000,66600000]);
 assert.deepEqual(auditNumberValues("有10万查询、6660万回答，GPT-5.6","zh"),[100000,66600000]);
 assert.deepEqual(auditNumberValues("六个模型，十二个正例、十个评分，602条记录","zh"),[6,10,12,602]);
 assert.deepEqual(auditNumberValues("1.234 samples and 23,5%","de"),[23.5,1234]);
 const findings=auditTranslationText(text("We analyzed 100,000 queries with GPT-5.6."),text("我们用 GPT-5.6 分析了10万查询。"));assert.ok(!findings.some(f=>f.code==="number-review"));
 assert.ok(auditTranslationText(text("We analyzed 602 evaluation items across six models."),text("我们分析了600条评估记录。")).some(f=>f.code==="number-review"));
 for(const [source,target] of [["We studied 66.6M responses for $1k.","我们花费1000美元研究6660万次回复。"],["Top 5 agencies; the top 3 episodes; 1 in 4 answers; page 1.","前五家机构；前三集；四分之一的回答；第一页。"],["The past 2.5 years", "过去两年半"]])assert.ok(!auditTranslationText(text(source),text(target)).some(f=>f.code==='number-review'));
 const japanese=auditTranslationText({...text("AI検索利用率は初の5割超"),language:'ja'},text("AI搜索使用率首次超过50%"));assert.ok(!japanese.some(f=>f.code==='number-review'||f.code==='percentage-values'));
 assert.ok(auditTranslationText({...text("AI検索利用率は初の5割超"),language:'ja'},text("AI搜索使用率首次超过60%" )).some(f=>f.code==='percentage-values'));
 assert.ok(!auditTranslationText({...text("全面実施は1割、試験実施は7割"),language:'ja'},text("全面实施占1成、试行占七成")).some(f=>f.code==='percentage-values'||f.code==='number-review'));
 assert.ok(!auditTranslationText({...text("Peec AI lève 7 millions d’euros"),language:'fr'},text("Peec AI筹集700万欧元")).some(f=>f.code==='number-review'));
 assert.ok(!auditTranslationText({...text("GEO - 테크42"),language:'ko'},text("GEO - Tech42")).some(f=>f.code==='number-review'));
 assert.ok(!auditTranslationText(text("Top-3 results across 10 days"),text("十天内的前三条结果")).some(f=>f.code==='number-review'));
});
test("negation, comparison, percent units and navigation tails flag review rather than auto-rewrite",()=>{
 assert.ok(auditTranslationText(text("Perplexity cited 42% more sources."),text("Perplexity引用42%的来源。")).some(f=>f.code==="comparison-review"));
 assert.ok(!auditTranslationText(text("Perplexity cited 42% more sources."),text("Perplexity引用的来源增加42%。")).some(f=>f.code==="comparison-review"));
 assert.ok(!auditTranslationText(text("Recommended 100% of the time, but less than a 0.1-star advantage reverses this."),text("推荐概率100%，但不足0.1星的优势会逆转这一结果。")).some(f=>f.code==="comparison-review"));
 assert.ok(auditTranslationText(text("No clicks, only impressions."),text("有点击，只有展示。")).some(f=>f.code==="negation-review"));
 assert.ok(!auditTranslationText(text("No clicks, only impressions."),text("没有点击，只有展示。")).some(f=>f.code==="negation-review"));
 assert.ok(!auditTranslationText(text("Not only clicks but also impressions."),text("既有点击也有展示。")).some(f=>f.code==="negation-review"));
 assert.ok(auditTranslationText(text("38% fewer searches"),text("搜索减少38个百分点")).some(f=>f.code==="percentage-point-review"));
 assert.ok(!auditTranslationText(text("A 25.1 percentage-point gap with 87.7\\\\% agreement"),text("相差25.1个百分点，一致率87.7%")).some(f=>f.code.startsWith('percentage')));
 assert.ok(auditTranslationText(text("No 25% increase"),text("没有25%的增长，还有42%的流量")).some(f=>f.code==="percentage-values"));
 assert.ok(auditTranslationText(text("No 25% increase"),text("没有百分之二十五的增长")).every(f=>f.code!=="percentage-values"));
 assert.ok(auditTranslationText(text("AI search. Read more"),text("AI搜索。阅读更多")).some(f=>f.code==="navigation-tail"));
 assert.equal(auditTranslationText(text("AI search",null),text("AI搜索",null)).length,0);
});
