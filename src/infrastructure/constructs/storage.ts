import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { aws_dynamodb, aws_s3 } from "aws-cdk-lib";

export class StorageConstruct extends Construct {
  public readonly singleTableV4: aws_dynamodb.Table;
  public readonly audioBucket: aws_s3.Bucket;
  public readonly siteBucket: aws_s3.Bucket;

  constructor(scope: Construct, id: string, props: any) {
    super(scope, id);

    // const { SENTENCE_TABLE_NAME, SENTENCE_BUCKET_NAME } = props;

    // TABLES
    this.singleTableV4 = new aws_dynamodb.Table(this, "singleV4", {
      partitionKey: { name: "PK", type: aws_dynamodb.AttributeType.STRING },
      sortKey: { name: "SK", type: aws_dynamodb.AttributeType.STRING },
      billingMode: aws_dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      pointInTimeRecovery: true,
    });

    // GSI: PrefixSearchV2
    // - On Word head items only
    // - Keys: PrefixSearchPK = "WORDP1#<Letter>", PrefixSearchSK = "<prefix>"
    this.singleTableV4.addGlobalSecondaryIndex({
      indexName: "PrefixSearchV2",
      partitionKey: {
        name: "PrefixSearchPK",
        type: aws_dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: "PrefixSearchSK",
        type: aws_dynamodb.AttributeType.STRING,
      },
      projectionType: aws_dynamodb.ProjectionType.INCLUDE,
      // only include necessary attributes to reduce storage cost. you need to create new index if additional attributes are needed
      nonKeyAttributes: ["isInflected"],
    });

    // GSI: SentenceWords
    // - On Word→Sentence edge items only
    // - Keys: SentenceSearchPK = "SENT#<id>", SentenceSearchSK = "WORD#<word>"
    this.singleTableV4.addGlobalSecondaryIndex({
      indexName: "SentenceWords",
      partitionKey: {
        name: "SentenceWordsPK",
        type: aws_dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: "SentenceWordsSK",
        type: aws_dynamodb.AttributeType.STRING,
      },
      projectionType: aws_dynamodb.ProjectionType.KEYS_ONLY,
    });

    // BUCKETS
    this.audioBucket = new aws_s3.Bucket(this, "audio", {
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    this.siteBucket = new aws_s3.Bucket(this, "siteBucket", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // new aws_s3_deployment.BucketDeployment(this, 'Deployment', {
    //   sources: [aws_s3_deployment.Source.asset('./front-build')],
    //   destinationBucket: this.siteBucket,
    //   // distribution: siteDistribution,
    //   // distributionPaths: ["/*"]
    // });
  }
}
