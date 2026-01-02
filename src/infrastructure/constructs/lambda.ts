import * as path from "path";

import * as cdk from "aws-cdk-lib";
import { aws_lambda as lambda } from "aws-cdk-lib";
import { Construct } from "constructs";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";

export class LambdaConstruct extends Construct {
  public readonly apiHandler: NodejsFunction;
  public readonly uriModifier: NodejsFunction;

  constructor(scope: Construct, id: string, props: any) {
    super(scope, id);

    const { V4_SINGLE_TABLE_NAME } = props;

    const { APP_REGION, APIGATEWAY_AUTH_TOKEN } = process.env;

    // TODO: remove obsolete uri modifier
    this.uriModifier = new NodejsFunction(this, "uriModifier", {
      memorySize: 128,
      timeout: cdk.Duration.seconds(5),
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "uriModifier",
      entry: path.join(__dirname, `/../../lambda/uri-modifier.ts`),
    });

    this.apiHandler = new NodejsFunction(this, "apiHandler", {
      memorySize: 128,
      timeout: cdk.Duration.seconds(10),
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "handler",
      entry: path.join(__dirname, `/../../lambda/api-handler.ts`),
      environment: {
        APP_REGION: APP_REGION!,
        V4_SINGLE_TABLE_NAME: V4_SINGLE_TABLE_NAME,
        APIGATEWAY_AUTH_TOKEN: APIGATEWAY_AUTH_TOKEN!,
      },
    });
  }
}
