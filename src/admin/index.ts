import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({
  path: path.join(__dirname, "../.env"),
});
// import api from seperate module to make sure dotenv is loaded first
import("./api");
