import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

if (existsSync(".env")) {
  console.log(".env 已存在，保留现有配置。");
} else {
  const secret = () => randomBytes(24).toString("hex");
  const databasePassword = secret();
  let env = readFileSync(".env.example", "utf8");
  for (const [key, value] of Object.entries({ ADMIN_PASSWORD: secret(), SESSION_SECRET: secret(), IMG_PROXY_SIGN_SECRET: secret(), POSTGRES_PASSWORD: databasePassword })) {
    env = env.replace(new RegExp(`^${key}=$`, "m"), `${key}=${value}`);
  }
  env = env.replace(/^COLLECT_ENABLED=.*$/m, "COLLECT_ENABLED=false").replace(/^MODEL_CALLS_ENABLED=.*$/m, "MODEL_CALLS_ENABLED=false");
  env += `\n# GEO 本地开发；仅监听本机。\nDATABASE_URL=postgres://geo_local:${databasePassword}@127.0.0.1:55432/geo_learning_map\nAPI_BASE_URL=http://127.0.0.1:3001\nAPI_HOST=127.0.0.1\nWEB_HOST=127.0.0.1\nINGEST_TOKEN=${secret()}\n`;
  writeFileSync(".env", env, { mode: 0o600 });
  console.log("已生成本地 .env；管理员密码保存在其中，采集和模型调用默认关闭。");
}
