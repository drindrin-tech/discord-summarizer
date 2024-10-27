terraform {
  required_version = ">= 1.9"
  required_providers {
    aws = { source = "hashicorp/aws", version = "5.72.1" }
  }

  backend "s3" {
    region = "eu-west-1"
  }
}

locals {
  environment = var.environment
  aws_region  = "eu-west-1"
  aws_profile = var.aws_profile

  resource_name_prefix = var.resource_name_prefix
}

provider "aws" {
  region  = local.aws_region
  profile = local.aws_profile
}

resource "aws_cloudwatch_event_rule" "lambda_summarizer_bot_schedule" {
  name                = "${local.resource_name_prefix}-lambda-summarizer-bot-schedule"
  schedule_expression = "cron(0 17 * * ? *)" # Runs at 5 PM UTC every day
}

resource "aws_cloudwatch_event_target" "lambda_target" {
  rule      = aws_cloudwatch_event_rule.lambda_summarizer_bot_schedule.name
  target_id = "${local.resource_name_prefix}-lambda-summarizer-bot-target"
  arn       = aws_lambda_function.summarizer_bot.arn
}

resource "aws_lambda_permission" "allow_cloudwatch" {
  statement_id  = "AllowExecutionFromCloudWatch"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.summarizer_bot.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.lambda_summarizer_bot_schedule.arn
}
