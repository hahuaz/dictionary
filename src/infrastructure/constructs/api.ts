import { Construct } from "constructs";
import {
  aws_apigateway as apigateway,
  aws_certificatemanager as certificatemanager,
  CfnOutput,
} from "aws-cdk-lib";

export class ApiConstruct extends Construct {
  public readonly api: apigateway.RestApi;
  public readonly wordProxy: apigateway.ProxyResource;

  constructor(scope: Construct, id: string, props: any) {
    super(scope, id);

    const { API_ENGLISH_SUBDOMAIN, STAR_SUBDOMAIN_CERTIFICATE, apiHandler } =
      props;

    // TODO: set api burst and rate limit to prevent abuse
    // TODO: limit cors
    this.api = new apigateway.RestApi(this, id, {
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: [
          "Content-Type",
          "X-Amz-Date",
          "Authorization",
          "X-Api-Key",
          "X-Amz-Security-Token",
          "X-Requested-With",
        ],
      },
    });

    // catch /search
    const searchResource = this.api.root.addResource("search", {
      // removes the burden that we have to declare same integration for every method
      defaultIntegration: new apigateway.LambdaIntegration(apiHandler),
    });
    searchResource.addMethod("GET");

    // create custom domain for api
    const apiDomain = new apigateway.DomainName(this, "ApiDomain", {
      domainName: API_ENGLISH_SUBDOMAIN,
      certificate: certificatemanager.Certificate.fromCertificateArn(
        this,
        "STAR_SUBDOMAIN_CERTIFICATE",
        STAR_SUBDOMAIN_CERTIFICATE as string
      ),
      endpointType: apigateway.EndpointType.REGIONAL,
      securityPolicy: apigateway.SecurityPolicy.TLS_1_2,
    });
    apiDomain.addBasePathMapping(this.api, { stage: this.api.deploymentStage });

    // this output must be used to point CNAME record to the api
    new CfnOutput(this, "domainNameAliasDomainName", {
      value: apiDomain.domainNameAliasDomainName, // e.g. d-xxxx.execute-api.us-east-1.amazonaws.com
    });
  }
}
