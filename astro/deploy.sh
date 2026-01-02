#!/bin/sh
set -e

# Load environment variables from .env
if [ -f .env ]; then
  . ./.env
fi

echo "Syncing to S3 bucket: $AWS_S3_BUCKET"
aws s3 sync dist $AWS_S3_BUCKET --delete --size-only --profile ${MY_AWS_PROFILE}

echo "Invalidating CloudFront distribution: $CLOUDFRONT_DIST_ID"
aws cloudfront create-invalidation --distribution-id $CLOUDFRONT_DIST_ID --paths "/*" --profile ${MY_AWS_PROFILE}
