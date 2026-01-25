#!/usr/bin/env bash
set -euo pipefail

# Helper: production DB connection strings (Cloud SQL)
#
# This script intentionally DOES NOT fetch or print the prod DB password.
# Instead, it emits URL templates that reference $PROD_DB_PASSWORD.
#
# Examples (zsh/bash):
#   # 1) See what Cloud Run is currently using (password redacted)
#   ./scripts/prod-db-env.sh show-cloudrun
#
#   # 2) Export a local URL for use with Cloud SQL Proxy on localhost:5433
#   export PROD_DB_PASSWORD="..."
#   eval "$(./scripts/prod-db-env.sh export proxy-port)"
#   echo "$DATABASE_URL"  # will include your password
#
#   # 3) Export the Cloud Run-style unix-socket URL template (for reference)
#   export PROD_DB_PASSWORD="..."
#   eval "$(./scripts/prod-db-env.sh export cloudrun)"

PROJECT_ID="${PROJECT_ID:-nexus-enterprise-480610}"
REGION="${REGION:-us-central1}"
SERVICE="${SERVICE:-nexus-api}"

INSTANCE_NAME="${INSTANCE_NAME:-nexusprod-v2}"
INSTANCE_CONNECTION_NAME="${PROJECT_ID}:${REGION}:${INSTANCE_NAME}"

DB_USER="${DB_USER:-postgres}"
DB_NAME="${DB_NAME:-nexus_db}"

LOCAL_PORT="${LOCAL_PORT:-5433}"
SOCKET_DIR="${SOCKET_DIR:-/tmp/cloudsql}"

usage() {
  cat <<'USAGE'
Usage:
  ./scripts/prod-db-env.sh templates
  ./scripts/prod-db-env.sh export <cloudrun|proxy-port|proxy-socket>
  ./scripts/prod-db-env.sh show-cloudrun

Notes:
  - All templates reference $PROD_DB_PASSWORD (not stored here).
  - "cloudrun" uses Cloud SQL unix socket path: /cloudsql/<instance>
  - "proxy-port" assumes you run cloud-sql-proxy locally on 127.0.0.1:5433
  - "proxy-socket" assumes you run cloud-sql-proxy with --unix-socket=/tmp/cloudsql
USAGE
}

cloudrun_template() {
  # Cloud Run convention: connect via unix socket mounted at /cloudsql/<instance>
  echo "postgresql://${DB_USER}:\${PROD_DB_PASSWORD}@/${DB_NAME}?host=/cloudsql/${INSTANCE_CONNECTION_NAME}&schema=public"
}

proxy_port_template() {
  # Local development convention: connect via Cloud SQL Proxy listening on TCP
  echo "postgresql://${DB_USER}:\${PROD_DB_PASSWORD}@127.0.0.1:${LOCAL_PORT}/${DB_NAME}?schema=public"
}

proxy_socket_template() {
  # Local development alternative: Cloud SQL Proxy with unix socket directory
  echo "postgresql://${DB_USER}:\${PROD_DB_PASSWORD}@/${DB_NAME}?host=${SOCKET_DIR}/${INSTANCE_CONNECTION_NAME}&schema=public"
}

show_cloudrun() {
  if ! command -v gcloud >/dev/null 2>&1; then
    echo "gcloud not found" >&2
    exit 1
  fi

  # Print a redacted version of DATABASE_URL from the Cloud Run service.
  gcloud run services describe "$SERVICE" \
    --project="$PROJECT_ID" \
    --region="$REGION" \
    --format=json \
  | python3 -c "import json,sys; from urllib.parse import urlsplit,urlunsplit

d=json.load(sys.stdin)
try:
  env=d['spec']['template']['spec']['containers'][0].get('env',[])
except Exception:
  env=[]

def redact_url(s):
  u=urlsplit(s); n=u.netloc
  if '@' in n and ':' in n.split('@',1)[0]:
    ui,hi=n.split('@',1); user=ui.split(':',1)[0]; n=f'{user}:****@{hi}'
  return urlunsplit((u.scheme,n,u.path,u.query,u.fragment))

for e in env:
  if e.get('name')=='DATABASE_URL' and 'value' in e:
    print(redact_url(e['value']))
    raise SystemExit(0)
print('<DATABASE_URL not found>')
"
}

cmd="${1:-}"
case "$cmd" in
  templates)
    echo "cloudrun    : $(cloudrun_template)"
    echo "proxy-port  : $(proxy_port_template)"
    echo "proxy-socket: $(proxy_socket_template)"
    ;;
  export)
    target="${2:-}"
    case "$target" in
      cloudrun)
        echo "export DATABASE_URL=\"$(cloudrun_template)\""
        ;;
      proxy-port)
        echo "export DATABASE_URL=\"$(proxy_port_template)\""
        ;;
      proxy-socket)
        echo "export DATABASE_URL=\"$(proxy_socket_template)\""
        ;;
      *)
        usage
        exit 2
        ;;
    esac
    ;;
  show-cloudrun)
    show_cloudrun
    ;;
  ""|help|-h|--help)
    usage
    ;;
  *)
    usage
    exit 2
    ;;
esac
