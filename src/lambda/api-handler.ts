import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";

import { createResponse, searchBaseWords, searchWords } from "@/lib";

const { APP_REGION, APIGATEWAY_AUTH_TOKEN } = process.env;

const docClient = new DynamoDBClient({
  region: APP_REGION,
});

const routes = {
  getSearch: "GET /search",
};

export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  console.log("incomingEvent", JSON.stringify(event, null, 2));

  const { httpMethod, path, queryStringParameters } = event;

  const routeKey = `${httpMethod} ${path}`;

  if (routeKey === routes.getSearch) {
    const { prefix } = queryStringParameters || {};

    if (!prefix) return createResponse(400);

    let words = await searchBaseWords({
      prefix,
      limit: 10,
      docClient,
    });

    // if no base words found, fall back to searching including inflected words
    if (!words.length) {
      words = await searchWords({
        prefix,
        limit: 10,
        docClient,
      });
    }

    return {
      body: JSON.stringify(words),
      headers: {
        "content-type": "application/json",
        "access-control-allow-origin": "*",
        "cache-control": "no-store",
      },
      statusCode: 200,
    };
  }

  return createResponse(200, "invalid route");
}
