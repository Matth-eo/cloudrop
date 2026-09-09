# Hourly cleanup with EventBridge Scheduler

Target: the existing `cloudrop-expiration-cleanup` Lambda. No Lambda code or execution-role changes are needed. This replaces the earlier 15-minute scheduled-rule setup for this function.

Choose **one** setup path: manual Scheduler console steps below, or deploy `scheduler.yaml` through CloudFormation. Do not use both; both create the same schedule/group. Neither path deploys Lambda code.

## Manual AWS Console steps

1. Open Lambda, select `cloudrop-expiration-cleanup`, and copy its function ARN. Use this same AWS account and region for Scheduler. Replace `REGION` and `ACCOUNT_ID` below using that ARN.
2. Open **Amazon EventBridge → Scheduler → Schedule groups**. Create a group called `cloudrop-cleanup`.
3. Open **IAM → Roles → Create role → Custom trust policy**. Paste this policy and name the role `cloudrop-cleanup-scheduler-role`. Do not attach broad managed permission policies.

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Service": "scheduler.amazonaws.com" },
    "Action": "sts:AssumeRole",
    "Condition": {
      "StringEquals": { "aws:SourceAccount": "ACCOUNT_ID" },
      "ArnEquals": {
        "aws:SourceArn": "arn:aws:scheduler:REGION:ACCOUNT_ID:schedule-group/cloudrop-cleanup"
      }
    }
  }]
}
```

4. On this role, select **Add permissions → Create inline policy → JSON**. Add the following, using the exact function ARN you copied. Name the policy `InvokeCloudropCleanupOnly`.

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": "lambda:InvokeFunction",
    "Resource": "arn:aws:lambda:REGION:ACCOUNT_ID:function:cloudrop-expiration-cleanup"
  }]
}
```

The Scheduler role needs only permission to invoke this function. The existing Lambda execution role continues to provide S3, DynamoDB, and logging permissions. Scheduler's trust condition uses the **schedule group ARN**, not an individual schedule ARN.

5. Return to **EventBridge → Scheduler → Schedules → Create schedule** and enter:

| Setting | Value |
| --- | --- |
| Schedule name | `cloudrop-expiration-cleanup-hourly` |
| Schedule group | `cloudrop-cleanup` |
| Schedule pattern | Recurring schedule |
| Schedule type | Rate-based schedule |
| Rate | `1` hour (`rate(1 hour)`) |
| Flexible time window | Off |
| Start/end | No end date; optionally set a future start time |

6. Choose the templated **AWS Lambda Invoke** target and select `cloudrop-expiration-cleanup`. Set the payload to exactly `{}` (an empty JSON object, not a quoted JSON string).
7. Under settings, choose **Enabled**, maximum event age **1 hour**, and maximum retries **2**. Leave a dead-letter queue unconfigured for this basic setup. For permissions, choose **Use existing role** and select `cloudrop-cleanup-scheduler-role`.
8. Review and create the schedule. Your console identity needs permission to pass this role to Scheduler (`iam:PassRole`), in addition to creating the role/schedule.
9. If the old 15-minute EventBridge rule or any other cleanup schedule was previously enabled, disable it to avoid duplicate schedules. Check both **EventBridge Rules** and **Scheduler Schedules**. Keep the new hourly schedule enabled.

`rate(1 hour)` means once per hourly interval, not necessarily at the top of the clock hour. With no start date it can begin immediately after creation. Scheduler has minute-level precision. Delivery can be retried, so this is not an exactly-once guarantee; the existing cleanup handler is already retry-safe.

## Confirm it works

Confirm the schedule is **Enabled**, has the correct target ARN, and shows payload `{}`. After a scheduled run, check **Lambda → Monitor → View CloudWatch logs** for `cleanup_completed` and the deleted/skipped/failed counts. Scheduler delivery success means Lambda accepted the asynchronous invocation; also inspect Lambda logs for actual cleanup results. A manual Lambda test by itself does not verify Scheduler permissions.

## Optional CloudFormation setup

Instead of manually creating the group, role, and schedule, open **CloudFormation → Create stack → With new resources → Upload a template file** and upload `lambda/cleanup/scheduler.yaml`. Use the existing Lambda's region, keep `FunctionName=cloudrop-expiration-cleanup`, acknowledge IAM resource creation, and create the stack. The template creates only the schedule group, least-privilege Scheduler role, and enabled hourly schedule. Do not deploy the older `template.yaml` for this step: that template also creates a separate Lambda with a 15-minute rule.

Nothing is deployed merely by adding these files to the project.

Sources: [AWS Lambda Scheduler setup](https://docs.aws.amazon.com/lambda/latest/dg/with-eventbridge-scheduler.html), [Scheduler trust policy restrictions](https://docs.aws.amazon.com/scheduler/latest/UserGuide/cross-service-confused-deputy-prevention.html).
