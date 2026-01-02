import * as dotenv from "dotenv";
import * as path from "path";
import inquirer from "inquirer";

const envPath = path.join(__dirname, "../../../.env");
console.log("Loading env from", envPath);

dotenv.config({ path: envPath });

// async function run() {
//   const { script } = await inquirer.prompt([
//     {
//       type: "list",
//       name: "script",
//       message: "Select a script to run:",
//       choices: [
//         { name: "output instagram", value: "word-card" },
//         { name: "Scan AI for Word Detail", value: "scan-ai-for-word-detail" },
//       ],
//     },
//   ]);

//   await import(`./${script}`);
// }

// run();

// import("./word-card");

// import("./antonym");

import("./get-forms");
