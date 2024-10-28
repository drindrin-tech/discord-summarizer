# Import .env file. Read the README.md for more informations.
set dotenv-load

# This justfile has been tested on linux, specifically on the dev container. Should there be any problems with its 
# use on other operating systems, please adjust the justfile accordingly using just attributes.
# Ref: https://github.com/casey/just?tab=readme-ov-file#enabling-and-disabling-recipes180

org := "mdd"
app := "discord-summarizer"
aws_profile  := env_var("AWS_PROFILE")
environment  := env("APP_ENVIRONMENT", "dev")
username     := env_var("APP_USERNAME")
resource_name_prefix := if environment == "dev" { environment + "-" + username  + "-" + app } else { environment + "-" + app }

backend_bucket := environment + "-" + org + "-terraform-state"
backend_dynamodb_table := environment + "-" + org + "-terraform-state"
backend_key := resource_name_prefix + ".tfstate"

# List the recipes
@default:
    just --list

# Remove all tmps file
@clean:
    echo "Cleaning all .tmp directories..."
    find . -type d -name ".tmp" -exec rm -rf {} + 
    echo "All .tmp directories have been removed"

[group('deployment')]
init *FLAGS:
    #!/usr/bin/env bash
    set -euxo pipefail
    cd {{justfile_directory()}}/ 
    terraform init \
        -backend-config="bucket={{ backend_bucket }}" \
        -backend-config="dynamodb_table={{ backend_dynamodb_table }}" \
        -backend-config="key={{ backend_key }}" \
        {{ FLAGS }}

[group('deployment')]
pa *FLAGS:
    #!/usr/bin/env bash
    set -euxo pipefail
    just plan {{ FLAGS }}
    just apply --auto-approve {{ FLAGS }}

[group('deployment-all')]
plan *FLAGS:
    #!/usr/bin/env bash
    set -euxo pipefail
    cd {{justfile_directory()}}/
    terraform plan \
        -var="environment={{ environment }}" \
        -var="aws_profile={{ aws_profile }}" \
        -var="resource_name_prefix={{ resource_name_prefix }}" \
        {{ FLAGS }}

[group('deployment')]
apply *FLAGS:
    #!/usr/bin/env bash
    set -euxo pipefail
    cd {{justfile_directory()}}/ 
    terraform apply \
        -var="environment={{ environment }}" \
        -var="aws_profile={{ aws_profile }}" \
        -var="resource_name_prefix={{ resource_name_prefix }}" \
        {{ FLAGS }}

[group('deployment')]
destroy *FLAGS:
    #!/usr/bin/env bash
    set -euxo pipefail
    cd {{justfile_directory()}}/ 
    terraform destroy \
        -var="environment={{ environment }}" \
        -var="aws_profile={{ aws_profile }}" \
        -var="resource_name_prefix={{ resource_name_prefix }}" \
        {{ FLAGS }}

# Format the module with Terraform
[group('check')]
fmt *FLAGS:
    #!/usr/bin/env bash
    set -euxo pipefail
    cd {{justfile_directory()}}/ 
    terraform fmt -recursive {{ FLAGS }}

# Validate the module
[group('check')]
validate *FLAGS:
    #!/usr/bin/env bash
    set -euxo pipefail
    cd {{justfile_directory()}}/ 
    terraform validate {{ FLAGS }}

# Lint checks for the module
[group('check')]
lint *FLAGS:
    #!/usr/bin/env bash
    set -euxo pipefail
    cd {{justfile_directory()}}/ 
    tflint -f compact --recursive {{ FLAGS }}

# Finds spelling mistakes among source code
[group('check')]
typos *FLAGS:
    #!/usr/bin/env bash
    set -euxo pipefail
    cd {{justfile_directory()}}/ 
    typos {{ FLAGS }}

# Security checks for the module using tfsec
[group('security')]
tfsec *FLAGS:
    #!/usr/bin/env bash
    set -euxo pipefail
    cd {{justfile_directory()}}/ 
    tfsec --no-code {{ FLAGS }}

# Security checks for the module using checkov
[group('security')]
checkov *FLAGS:
    #!/usr/bin/env bash
    set -euxo pipefail
    cd {{justfile_directory()}}/ 
    checkov -d . --compact {{ FLAGS }}

# Security checks for the module using terrascan
[group('security')]
terrascan *FLAGS:
    #!/usr/bin/env bash
    set -euxo pipefail
    cd {{justfile_directory()}}/ 
    terrascan scan {{ FLAGS }}


# Aliases for frequently used commands
[private]
alias f := fmt
[private]
alias p := plan
[private]
alias a := apply
[private]
alias d := destroy
[private]
alias v := validate