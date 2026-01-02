import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import {
  aws_cloudfront,
  aws_cloudfront_origins,
  aws_certificatemanager,
} from "aws-cdk-lib";

import { ApiConstruct } from "./constructs/api";
import { LambdaConstruct } from "./constructs/lambda";
import { StorageConstruct } from "./constructs/storage";

export class InSent extends cdk.Stack {
  constructor(scope: Construct, id: string, props: cdk.StackProps) {
    super(scope, id, props);

    const { DOMAIN, STAR_SUBDOMAIN_CERTIFICATE } = process.env;
    const ENGLISH_SUBDOMAIN = `english.${DOMAIN}`;
    const API_ENGLISH_SUBDOMAIN = `api-english.${DOMAIN}`;
    const AUDIO_SUBDOMAIN = `audio-english.${DOMAIN}`;

    // CUSTOM CONSTRUCTS
    const { audioBucket, siteBucket, singleTableV4 } = new StorageConstruct(
      this,
      `storage`,
      {}
    );

    // lamba, depends on storage
    const { apiHandler } = new LambdaConstruct(this, `lambda`, {
      SENTENCE_BUCKET_NAME: audioBucket.bucketName,
      V4_SINGLE_TABLE_NAME: singleTableV4.tableName,
    });

    // api, depends on lambda
    const { api: _api } = new ApiConstruct(this, `api`, {
      API_ENGLISH_SUBDOMAIN,
      STAR_SUBDOMAIN_CERTIFICATE,
      apiHandler,
    });

    singleTableV4.grantReadData(apiHandler);

    const subdomainCertificate =
      aws_certificatemanager.Certificate.fromCertificateArn(
        this,
        "STAR_SUBDOMAIN_CERTIFICATE",
        STAR_SUBDOMAIN_CERTIFICATE as string
      );

    const appendHtmlFn = new aws_cloudfront.Function(this, "appendHtml2", {
      code: aws_cloudfront.FunctionCode.fromInline(`
function handler(event) {
  var req = event.request;
  var uri = req.uri;

  if (uri === '/') { return req; } // defaultRootObject will handle '/'
  if (uri.indexOf('.') === -1) {
    req.uri = uri + '.html';
  }
  return req;
}
`),
    });

    const siteBucketDist = new aws_cloudfront.Distribution(
      this,
      "siteBucketDist",
      {
        defaultBehavior: {
          origin:
            aws_cloudfront_origins.S3BucketOrigin.withOriginAccessControl(
              siteBucket
            ),
          viewerProtocolPolicy:
            aws_cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: aws_cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
          functionAssociations: [
            {
              function: appendHtmlFn,
              eventType: aws_cloudfront.FunctionEventType.VIEWER_REQUEST,
            },
          ],
          // long cache on distribution level. it will be invalidated when we deploy new site
          cachePolicy: new aws_cloudfront.CachePolicy(this, "HtmlCacheLong", {
            defaultTtl: cdk.Duration.days(365),
            minTtl: cdk.Duration.days(1),
            maxTtl: cdk.Duration.days(365),
          }),
          responseHeadersPolicy: new aws_cloudfront.ResponseHeadersPolicy(
            this,
            "siteBucketDistResponsePolicy",
            {
              customHeadersBehavior: {
                customHeaders: [
                  {
                    header: "Cache-Control",
                    // 1 month (2592000 seconds)
                    value: "public, max-age=2592000, immutable",
                    override: true,
                  },
                ],
              },
              // limit CORS if frontend ever serves important assets
              // corsBehavior: {
              //   accessControlAllowOrigins: [`https://${ENGLISH_SUBDOMAIN}`],
              //   originOverride: true,
              //   accessControlAllowMethods: ["HEAD", "GET", "OPTIONS"],
              //   accessControlAllowHeaders: ["*"],
              //   accessControlAllowCredentials: false,
              // },
              securityHeadersBehavior: {
                contentSecurityPolicy: {
                  contentSecurityPolicy: "frame-ancestors 'none';",
                  override: true,
                },
                frameOptions: {
                  frameOption: aws_cloudfront.HeadersFrameOption.DENY,
                  override: true,
                },
              },
            }
          ),
        },
        defaultRootObject: "index.html",
        errorResponses: [
          {
            // if s3 returns forbidden, serve 404 page
            httpStatus: 403,
            responseHttpStatus: 404,
            responsePagePath: "/404.html",
            ttl: cdk.Duration.seconds(0), // don't cache error
          },
          {
            // if s3 returns not found, serve 404 page
            httpStatus: 404,
            responseHttpStatus: 404,
            responsePagePath: "/404.html",
            ttl: cdk.Duration.seconds(0),
          },
        ],
        domainNames: [ENGLISH_SUBDOMAIN],
        certificate: subdomainCertificate,
      }
    );

    const audioBucketDist = new aws_cloudfront.Distribution(
      this,
      "audioBucketDist",
      {
        defaultBehavior: {
          origin:
            aws_cloudfront_origins.S3BucketOrigin.withOriginAccessControl(
              audioBucket
            ),
          viewerProtocolPolicy:
            aws_cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: aws_cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
          cachePolicy: new aws_cloudfront.CachePolicy(
            this,
            "audioBucketDistCachePolicy",
            {
              defaultTtl: cdk.Duration.days(365),
              minTtl: cdk.Duration.days(30),
              maxTtl: cdk.Duration.days(365),
            }
          ),
          responseHeadersPolicy: new aws_cloudfront.ResponseHeadersPolicy(
            this,
            "audioBucketDistResponsePolicy",
            {
              customHeadersBehavior: {
                customHeaders: [
                  {
                    header: "Cache-Control",
                    // 1 month (2592000 seconds)
                    value: "public, max-age=2592000, immutable",
                    override: true,
                  },
                  // apply CORP to prevent other sites to play the audio
                  {
                    header: "Cross-Origin-Resource-Policy",
                    value: "same-site",
                    override: true,
                  },
                ],
              },
              // apply strict cors to prevent other sites to access the audio via js(fetch, ajax)
              corsBehavior: {
                accessControlAllowOrigins: [
                  `https://${ENGLISH_SUBDOMAIN}`, // Allow main domain
                ],
                originOverride: true,
                accessControlAllowMethods: ["HEAD", "GET", "OPTIONS"],
                accessControlAllowHeaders: ["*"],
                accessControlAllowCredentials: false,
              },
            }
          ),
        },
        domainNames: [AUDIO_SUBDOMAIN],
        // CF distribution only accept certificates that is on us-east-1
        certificate: subdomainCertificate,
      }
    );

    // TODO create hosted zone by cdk

    // CFN OUTPUTS
    new cdk.CfnOutput(this, "siteBucketDistDomain", {
      value: siteBucketDist.distributionDomainName,
      description: "The domain name of siteBucketDist",
    });
    new cdk.CfnOutput(this, "audioBucketDistDomain", {
      value: audioBucketDist.distributionDomainName,
      description: "The domain name of audioBucketDist",
    });
  }
}
