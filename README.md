# Daily Weather Notifier — Serverless App

Small serverless app that sends daily weather updates to subscribed users. The stack uses an S3-hosted static frontend (optional CloudFront), API Gateway + Lambda for subscription management, DynamoDB for storage, EventBridge for scheduling, SES for email and SNS for optional SMS delivery.

## Tech stack

- AWS: API Gateway (REST), Lambda (Node.js 18.x), DynamoDB, EventBridge (scheduled rule), SES (email), SNS (SMS), SSM Parameter Store (SecureString), S3 (static hosting), CloudFront (optional)
- Deployment: AWS SAM (template.yaml)
- Language / runtime: Node.js (lambdas), plain HTML/JS for static frontend
- HTTP client: fetch API in browser; axios used in notifier lambda

## Repository structure

```
daily-weather-notifier/
├─ frontend/
│  ├─ index.html        # Static subscription UI
│  └─ app.js            # Frontend JS (set API_URL to deployed ApiUrl)
├─ lambdas/
│  ├─ subscription-handler/
│  │  ├─ handler.js     # POST /subscribe, POST /unsubscribe, GET /health
│  │  └─ package.json
│  └─ daily-notifier/
│     ├─ handler.js     # Scheduled Lambda: reads DynamoDB, calls OpenWeatherMap, uses SES/SNS
│     └─ package.json
├─ template.yaml        # SAM template (Lambda, DynamoDB, EventBridge, API Gateway)
└─ README.md
```

## Quick flow

1. User submits email (and optional phone/city) on the static site.
2. Frontend POSTs to API Gateway `/subscribe` → Subscription Lambda writes/updates DynamoDB `Subscribers` table.
3. EventBridge runs the `DailyWeatherNotifier` Lambda on schedule. It reads active subscribers, fetches weather from OpenWeatherMap, formats messages and sends email via SES and SMS via SNS (if phone is present).

## Prerequisites (local machine)

- Node.js 18+ and npm
- AWS CLI v2 configured (`aws configure`)
- AWS SAM CLI installed and on PATH
- Docker Desktop (only required for `sam local` testing)

## Environment / Secrets

Store secrets in SSM Parameter Store (SecureString) or Secrets Manager. Example SSM parameter used by the template:

- Name: `/daily-weather-notifier/weather-api-key`
- Value: your OpenWeatherMap API key

Create it (PowerShell example):

```powershell
aws ssm put-parameter --name "/daily-weather-notifier/weather-api-key" --value "<OPENWEATHERMAP_API_KEY>" --type SecureString --region us-east-1
```

Also verify your SES sender email in the region you'll deploy to and update `template.yaml` or the Lambda environment variable `SES_FROM_EMAIL` with that verified address.

## Setup & deploy (PowerShell)

1. Install dependencies for each lambda (optional but recommended so `sam build` can vendor them):

```powershell
cd D:\AWS-Project-HostGithub\daily-weather-notifier\lambdas\subscription-handler
npm install
cd ..\..\daily-notifier
npm install
cd D:\AWS-Project-HostGithub\daily-weather-notifier
```

2. Build and deploy with SAM (guided) — this will package and create a CloudFormation stack. Replace region and stack name as needed:

```powershell
# Build
sam build

# Guided deploy (first time)
sam deploy --guided
```

If you prefer non-interactive deploy (you've already created an S3 artifact bucket), run:

```powershell
sam build
sam deploy --template-file .aws-sam\\build\\template.yaml --stack-name daily-weather-notifier --s3-bucket <YOUR_S3_BUCKET> --capabilities CAPABILITY_IAM --region us-east-1 --no-confirm-changeset
```

When deploy finishes note the `ApiUrl` output (e.g. https://xxxxxxxx.execute-api.us-east-1.amazonaws.com/Prod). Update `frontend/app.js` with that URL and host `frontend/` on S3 or your static host.

## Host frontend on S3 (quick)

```powershell
# create bucket (unique name required)
aws s3 mb s3://my-weather-frontend-bucket --region us-east-1
# enable website hosting (optional)
aws s3 website s3://my-weather-frontend-bucket --index-document index.html
# upload files
aws s3 cp .\\frontend\\ s3://my-weather-frontend-bucket/ --recursive --acl public-read
```

For secure hosting use CloudFront with OAC/OAI and restrict bucket access.

## Start frontend locally

If you want to run the static frontend locally for development or testing, use one of these lightweight servers. Before starting, open `d:\AWS-Project-HostGithub\daily-weather-notifier\frontend\app.js` and make sure `API_URL` is set to your deployed ApiUrl (or a local proxy).

- Using Python 3 (no install required if Python is available):

```powershell
cd D:\AWS-Project-HostGithub\daily-weather-notifier\frontend
python -m http.server 8000
# then open http://localhost:8000 in your browser
```

- Using Node.js `http-server` (fast, supports directory listing):

```powershell
npm install -g http-server
cd D:\AWS-Project-HostGithub\daily-weather-notifier\frontend
http-server -p 8000
# open http://localhost:8000
```

- Using `live-server` (automatic reload during development):

```powershell
npm install -g live-server
cd D:\AWS-Project-HostGithub\daily-weather-notifier\frontend
live-server --port=8000
```

Notes:
- When running locally, CORS still applies if you call the deployed API Gateway. Use the deployed API with CORS enabled (the SAM template configures CORS) or use a local proxy during development.
- If you see API errors in the browser console, check the Network tab to inspect request URLs and preflight (OPTIONS) requests.

## Testing the API

Health check (GET):

```powershell
Invoke-RestMethod -Uri "https://<ApiId>.execute-api.<region>.amazonaws.com/Prod/health" -Method Get
```

Subscribe (POST):

```powershell
$body = @{ email = "you@example.com"; city = "Mumbai"; countryCode = "IN" } | ConvertTo-Json
Invoke-RestMethod -Uri "https://<ApiId>.execute-api.<region>.amazonaws.com/Prod/subscribe" -Method Post -Body $body -ContentType "application/json"
```

If you see `{"message":"Missing Authentication Token"}` in the browser, you likely requested the stage root (no method) or the frontend is pointed at the wrong ApiId. Ensure `app.js` uses the full resource path when calling.

## Inspecting data (DynamoDB) and logs

Describe table:

```powershell
aws dynamodb describe-table --table-name Subscribers --region us-east-1 --output table
```

Scan items (small tables only):

```powershell
aws dynamodb scan --table-name Subscribers --region us-east-1 --projection-expression "email,city,phone,subscribed,createdAt" --output table
```

Get a single item by email (replace example):

```powershell
aws dynamodb get-item --table-name Subscribers --region us-east-1 --key '{"email":{"S":"test@example.com"}}' --output json
```

Check Lambda CloudWatch logs (recent events):

```powershell
# list log groups
aws logs describe-log-groups --log-group-name-prefix '/aws/lambda/' --region us-east-1 --output table
# fetch recent events for SubscriptionHandler
aws logs filter-log-events --log-group-name "/aws/lambda/SubscriptionHandler" --limit 20 --region us-east-1 --output json
```

## CORS

The SAM template includes an `AWS::Serverless::Api` resource with CORS enabled (OPTIONS generated for your resources). If your browser still fails due to CORS, verify that `frontend/app.js` is calling the correct ApiId and that your hosted origin is allowed.

## Troubleshooting checklist

- `Missing Authentication Token` → You're calling the API root or wrong ApiId. Use full resource path: `/subscribe` or `/health`.
- `AccessDenied` from AWS CLI → confirm credentials: `aws sts get-caller-identity`.
- Lambda errors → check CloudWatch Logs for function error traces.
- SES issues → verify sender email and whether account is in SES sandbox.
- Table empty after subscribe → check Lambda CloudWatch logs and IAM permissions for DynamoDB writes.

## Next improvements

- Add double opt-in confirmation flow (SES confirmation links).
- Use pagination or Query with secondary indexes for large subscriber lists.
- Add tests, CI/CD pipeline and versioned deployments.

---

If you want, I can now:

- Upload the fixed frontend files to an S3 bucket you provide (or create one),
- Replace `API_URL` in the repo with the final ApiUrl, and
- Add example `tests/` events for local `sam` invocation.

Tell me which of those you'd like me to do next.

## Cleanup / Delete the project

When you're finished and want to remove all resources to avoid charges, follow these steps carefully. These commands assume the stack name is `daily-weather-notifier` and the AWS region is `us-east-1` — change values to match your environment.

IMPORTANT: Deleting the stack will remove the DynamoDB table, Lambda functions, EventBridge rule, API Gateway, and other resources created by the SAM template. Backup any data (for example, DynamoDB items) before deletion if you need to keep it.

1. (Optional) Backup subscribers from DynamoDB:

```powershell
aws dynamodb scan --table-name Subscribers --region us-east-1 --output json > subscribers-backup.json
```

2. Remove the CloudFormation/SAM stack (recommended: use SAM which can also clean up packaged artifacts):

Interactive (prompts for confirmation):

```powershell
sam delete --stack-name daily-weather-notifier --region us-east-1
```

Non-interactive (force delete without prompts):

```powershell
sam delete --stack-name daily-weather-notifier --region us-east-1 --no-prompts
```

If you prefer CloudFormation directly:

```powershell
aws cloudformation delete-stack --stack-name daily-weather-notifier --region us-east-1
aws cloudformation wait stack-delete-complete --stack-name daily-weather-notifier --region us-east-1
```

3. Remove any S3 buckets you created for hosting the frontend (replace with your bucket name):

```powershell
# Danger: --force deletes all objects in the bucket
aws s3 rb s3://my-weather-frontend-bucket --force --region us-east-1
```

4. Delete the SSM parameter storing the weather API key:

```powershell
aws ssm delete-parameter --name "/daily-weather-notifier/weather-api-key" --region us-east-1
```

5. If you verified a sender identity in SES for testing and want to remove it:

```powershell
aws ses delete-identity --identity "you@yourdomain.com" --region us-east-1
```

6. If you created a dedicated S3 bucket for SAM artifacts and want to remove it, delete all objects and the bucket (replace with your artifacts bucket):

```powershell
aws s3 rb s3://daily-weather-notifier-sam-artifacts-348823728691-us-east-1 --force --region us-east-1
```

7. (Optional) If you created a CloudFront distribution for the frontend, disable it, wait for deployment, then delete it. This process takes time and requires fetching the distribution id. Example (high level):

```powershell
# List distributions and find the ID, then disable and delete (see CloudFront docs for exact steps)
aws cloudfront list-distributions
# Disable distribution, wait until disabled, then delete
```

8. Clean up local files (optional):

```powershell
Remove-Item -Recurse -Force .aws-sam
Remove-Item samconfig.toml -ErrorAction SilentlyContinue
```

Notes and cautions
- Some resources (like CloudFront distributions) take time to fully delete — follow the console or AWS CLI waiters.
- If you used third-party services (domain registration, DNS records, verified domains), remove DNS entries or verification records as needed.
- Always double-check bucket names before running `aws s3 rb --force` — this will irreversibly delete objects.

If you want, I can perform the cleanup for you (I can delete the stack and optionally remove S3 buckets). Tell me which resources you'd like removed and confirm the stack and bucket names.
