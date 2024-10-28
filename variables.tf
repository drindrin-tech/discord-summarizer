variable "environment" {
  description = "Environment name (e.g., dev, prod)"
  type        = string
  default     = "dev"

  validation {
    condition     = contains(["dev", "prod"], var.environment)
    error_message = "Environment must be one of: dev, prod."
  }
}

variable "aws_profile" {
  description = "AWS profile to use"
  type        = string
}

variable "discord_bot_token" {
  description = "Discord bot token"
  type        = string
}

variable "openai_api_key" {
  description = "OpenAI API key"
  type        = string
}

variable "resource_name_prefix" {
  description = "Resource name prefix"
  type        = string
}

variable "source_channel_ids" {
  description = "Source channel IDs"
  type        = list(string)
}

variable "target_channel_ids" {
  description = "Target channel IDs"
  type        = list(string)
  default     = null
}
