import * as dotenv from "dotenv";
import * as path from "path";
import inquirer from "inquirer";

const envPath = path.join(__dirname, "../../../.env");
console.log("Loading env from", envPath);

dotenv.config({ path: envPath });

async function run() {
  const { script } = await inquirer.prompt([
    {
      type: "list",
      name: "script",
      message: "Select a script to run:",
      choices: [
        { name: "Generate Word Card", value: "gen-word-card" },
        { name: "Generate Antonym Card", value: "gen-word-card_antonym" },
        { name: "Ingest Words (Ngrams/Diff)", value: "ingest-words" },
        { name: "Scan AI for Word Detail", value: "get-word" },
      ],
    },
  ]);

  await import(`./${script}`);
}

run().catch(console.error);
