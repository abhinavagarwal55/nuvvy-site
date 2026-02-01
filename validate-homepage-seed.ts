import { readFileSync } from "fs";
import { HomepageSchema } from "./src/lib/schemas/homepage.schema";

const raw = readFileSync("./homepage.seed.json", "utf-8");
const json = JSON.parse(raw);

try {
  HomepageSchema.parse(json);
  console.log("✅ Homepage seed JSON is VALID");
} catch (err) {
  console.error("❌ Homepage seed JSON is INVALID");
  console.error(err);
  process.exit(1);
}
