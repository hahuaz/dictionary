import { APIGatewayProxyResult } from "aws-lambda";

export const createResponse = (
  statusCode: number,
  message?: string
): APIGatewayProxyResult => {
  const response: any = {
    statusCode,
    headers: {
      "access-control-allow-origin": "*",
      "cache-control": "no-store",
    },
  };

  if (message) {
    response.headers["content-type"] = "application/json";
    return {
      ...response,
      body: JSON.stringify({
        message,
      }),
    };
  } else {
    return response;
  }
};

/**
 * Splits an array into chunks of a specified size.
 */
export const chunk = <T>(arr: T[], size: number) => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};
