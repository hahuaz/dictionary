#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import * as dotenv from "dotenv";
dotenv.config();

import { InSent } from "../infrastructure/in_sent";

// To avoid recurring costs from Secret Manager service, we will utilize .env files. However, this approach has the disadvantage of not being able to use CI/CD pipelines.
const {
  GOOGLE_SPEECH_KEY,
  DOMAIN,
  STAR_SUBDOMAIN_CERTIFICATE,
  APP_NAME,
  ACCOUNT,
  APP_REGION,
  BRANCH,
  APIGATEWAY_AUTH_TOKEN,
} = process.env;

if (
  !GOOGLE_SPEECH_KEY ||
  !DOMAIN ||
  !STAR_SUBDOMAIN_CERTIFICATE ||
  !APP_NAME ||
  !ACCOUNT ||
  !APP_REGION ||
  !BRANCH ||
  !APIGATEWAY_AUTH_TOKEN
) {
  throw new Error("missing env variable.");
}

const app = new cdk.App();

new InSent(app, `${BRANCH}-${APP_NAME}`, {
  env: { account: ACCOUNT, region: APP_REGION },
});
