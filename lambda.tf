resource "terraform_data" "builder_lambda_summarizer_bot" {
  provisioner "local-exec" {
    working_dir = "${path.module}/lambda_summarizer_bot/"
    command     = "npm install && npm run build"
  }

  triggers_replace = {
    index    = filebase64sha256("${path.module}/lambda_summarizer_bot/index.ts"),
    package  = filebase64sha256("${path.module}/lambda_summarizer_bot/package.json"),
    lock     = filebase64sha256("${path.module}/lambda_summarizer_bot/package-lock.json"),
    tscongig = filebase64sha256("${path.module}/lambda_summarizer_bot/tsconfig.json"),
  }
}

data "archive_file" "archiver_lambda_summarizer_bot" {
  type        = "zip"
  source_dir  = "${path.module}/lambda_summarizer_bot/dist/"
  output_path = "${path.module}/lambda_summarizer_bot/dist/dist.zip"
  excludes    = ["dist.zip"]

  depends_on = [
    terraform_data.builder_lambda_summarizer_bot
  ]
}

resource "aws_lambda_function" "summarizer_bot" {
  function_name = "${local.resource_name_prefix}-lambda-summarizer-bot"

  handler = "index.handler"
  runtime = "nodejs20.x"
  publish = true
  role    = aws_iam_role.lambda_summarizer_bot.arn

  filename         = data.archive_file.archiver_lambda_summarizer_bot.output_path
  source_code_hash = data.archive_file.archiver_lambda_summarizer_bot.output_base64sha256
  timeout          = 20

  environment {
    variables = {
      OPENAI_API_KEY = var.openai_api_key
      DISCORD_BOT_TOKEN = var.discord_bot_token
    }
  }

  depends_on = [
    terraform_data.builder_lambda_summarizer_bot,
    data.archive_file.archiver_lambda_summarizer_bot,
  ]
}

data "aws_iam_policy_document" "lambda_assume_role_policy" {
  statement {
    actions = ["sts:AssumeRole"]
    effect  = "Allow"
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "lambda_summarizer_bot" {
  name               = "${local.resource_name_prefix}-lambda-summarizer-bot-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role_policy.json
}

data "aws_iam_policy_document" "lambda_summarizer_bot" {
  statement {
    actions = [
      "logs:CreateLogGroup",
      "logs:CreateLogStream",
      "logs:PutLogEvents"
    ]
    resources = ["arn:aws:logs:*:*:*"]
    effect    = "Allow"
  }
}

resource "aws_iam_role_policy" "lambda_summarizer_bot" {
  name   = "${local.resource_name_prefix}-lambda-summarizer-bot-role-policy"
  role   = aws_iam_role.lambda_summarizer_bot.id
  policy = data.aws_iam_policy_document.lambda_summarizer_bot.json
}
