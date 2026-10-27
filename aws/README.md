# AWS practice deployment: Singapore

Prepared for authorised use of account 752079919261 through profile default in
ap-southeast-1. All scripts explicitly name the region and verify the account.
Nothing runs against Keydemand infrastructure. The template creates its own VPC.

## Review before launch

This temporary learning setup uses HTTP limited to a learner-supplied public IPv4
/32, with no application login. Use dummy data only. MongoDB is in the same ECS
task as the API and binds to localhost; port 27017 is not exposed by security groups.
MongoDB uses ephemeral storage: task replacement, redeployment or rollback loses
its data. This differs from the persistent named volume in the local Compose lab.
This is not a production database design.

Task networking uses public IPs for outbound image pulls, avoiding a NAT gateway.
The API's inbound port accepts traffic only from this lab's load-balancer security
group. Only the ALB accepts your approved IPv4 on HTTP port 80. No DNS, TLS, WAF,
company secrets, autoscaling, managed backups or durable database are configured.
Failure drills are enabled only for the restricted lab endpoint.

Resources incur charges, including Fargate, ALB, public IPv4, ECR, CloudWatch and SNS.
An idle lab still costs money. Cleanup is manual; there is no scheduled deletion.

## 1. Validate and preview (no resource creation)

From D:\devops-core-lab:

    .\aws\deploy.ps1

The script checks account identity and calls CloudFormation validate-template.
Validation does not prove deployment permissions, runtime behaviour or quotas.

## 2. Deploy when ready

Obtain the public IPv4 address of your approved network. A private 192.168/10.x
address will not work. If the public egress IP changes, redeploy with the new /32.

    .\aws\deploy.ps1 -Execute -AllowedCidr YOUR_PUBLIC_IPV4/32 -AlertEmail YOUR_EMAIL

AlertEmail is optional. After deploy, click Confirm in the SNS subscription email.
Deploy creates image repositories, builds and pushes both images, then creates the
runtime stack. It prints the URL. Deployment needs Docker Desktop running and IAM,
ECR, ECS, EC2, ELB, Logs, SNS and CloudFormation permissions; IAM PassRole and the ECS
service-linked role may also be required. Do not broaden your permissions without
company authorisation. If it fails, inspect the stack events before cleanup.

## 3. Observe

    aws ecs describe-services --cluster devops-practice-core --services devops-practice-core --profile default --region ap-southeast-1
    aws logs tail /devops-practice/core --since 10m --follow --profile default --region ap-southeast-1

CloudWatch dashboard: devops-practice-core. Two server errors in a one-minute period
trigger the error alarm. ALB readiness below one healthy target for two one-minute
periods triggers the availability alarm. Alarm/OK notifications use SNS.

Call URL/health, URL/health/ready and URL/tasks. For an error exercise, call
URL/drills/error twice, then wait for CloudWatch metric ingestion/evaluation.
HTTP 500 is expected. Email requires subscription confirmation; it is not immediate.

Readiness failure can make ECS replace the entire task, which also resets the
temporary database. Use the local lab for manually stopping MongoDB independently.

## 4. Delete after the session

Preview:

    .\aws\cleanup.ps1

Delete only the two lab stacks, in dependency order:

    .\aws\cleanup.ps1 -Execute

Cleanup verifies the account and Project tags. The image template uses
EmptyOnDelete so ECR images are deleted with the lab repositories. CloudWatch logs
are also deleted. Export any learning evidence you want before cleanup. The scripts
do not remove AWS-managed ECS service-linked roles or cached local Docker credentials.

GitHub CI is prepared separately; it has no AWS access and no automatic deployment.
