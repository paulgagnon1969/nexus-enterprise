#!/usr/bin/env bash
# =============================================================================
# prod-health-monitor.sh — Production stack health monitor for Mac Studio
# =============================================================================
# Checks Docker Desktop, all nexus-shadow-* containers, and health endpoints.
# Auto-restarts Docker Desktop and/or containers on failure.
# Sends macOS notifications and logs to file.
#
# Designed to run via launchd every 60 seconds.
# Manual run: bash infra/scripts/prod-health-monitor.sh
# =============================================================================

set -o pipefail

# ── Config ───────────────────────────────────────────────────────────────────
REPO_ROOT="/Users/pg/nexus-enterprise"
COMPOSE_FILE="${REPO_ROOT}/infra/docker/docker-compose.shadow.yml"
PROJECT_NAME="nexus-shadow"
LOG_DIR="${REPO_ROOT}/infra/logs"
LOG_FILE="${LOG_DIR}/prod-health-monitor.log"
MAX_LOG_SIZE=5242880  # 5MB — rotate when exceeded

# Containers that MUST be running
REQUIRED_CONTAINERS=(
  nexus-shadow-api
  nexus-shadow-worker
  nexus-shadow-web
  nexus-shadow-postgres
  nexus-shadow-redis
  nexus-shadow-minio
  nexus-shadow-tunnel
  nexus-shadow-receipt-poller
)

# Health endpoints — local (container-level)
HEALTH_ENDPOINTS=(
  "http://localhost:8000/health|API"
  "http://localhost:8001/health|Worker"
  "http://localhost:3001|Web"
)

# External endpoints — public URLs through Cloudflare (what users actually hit)
EXTERNAL_ENDPOINTS=(
  "https://staging-api.nfsgrp.com/health|API (external)"
  "https://staging-ncc.nfsgrp.com|Web (external)"
)

# DNS hostnames that MUST resolve (used for proactive DNS cache validation)
REQUIRED_DNS_HOSTS=(
  staging-api.nfsgrp.com
  staging-ncc.nfsgrp.com
)

# Cooldown: don't flush DNS cache more than once per 5 minutes
DNS_FLUSH_COOLDOWN_FILE="/tmp/nexus-monitor-dns-flush-cooldown"
DNS_FLUSH_COOLDOWN_SECONDS=300

# Docker Desktop startup timeout (seconds)
DOCKER_STARTUP_TIMEOUT=120

# Cooldown: don't restart Docker Desktop more than once per 10 minutes
COOLDOWN_FILE="/tmp/nexus-monitor-docker-restart-cooldown"
COOLDOWN_SECONDS=600

# ── Helpers ──────────────────────────────────────────────────────────────────
mkdir -p "${LOG_DIR}"

log() {
  local level="$1"; shift
  local ts
  ts=$(date '+%Y-%m-%d %H:%M:%S')
  echo "[${ts}] [${level}] $*" >> "${LOG_FILE}"
}

rotate_log() {
  if [[ -f "${LOG_FILE}" ]] && (( $(stat -f%z "${LOG_FILE}" 2>/dev/null || echo 0) > MAX_LOG_SIZE )); then
    mv "${LOG_FILE}" "${LOG_FILE}.prev"
    log INFO "Log rotated"
  fi
}

notify() {
  local title="$1"
  local message="$2"
  local urgency="${3:-normal}"  # normal or critical

  # macOS Notification Center
  if command -v terminal-notifier &>/dev/null; then
    terminal-notifier \
      -title "NEXUS Prod Monitor" \
      -subtitle "${title}" \
      -message "${message}" \
      -sound "${urgency}" \
      -group "nexus-prod-monitor" \
      2>/dev/null &
  fi

  # Also log the notification
  log ALERT "${title}: ${message}"
}

notify_critical() {
  notify "$1" "$2" "Basso"
  # Play a system alert sound for critical issues
  afplay /System/Library/Sounds/Sosumi.aiff 2>/dev/null &
}

is_in_cooldown() {
  if [[ -f "${COOLDOWN_FILE}" ]]; then
    local last_restart
    last_restart=$(cat "${COOLDOWN_FILE}" 2>/dev/null || echo 0)
    local now
    now=$(date +%s)
    if (( now - last_restart < COOLDOWN_SECONDS )); then
      return 0  # in cooldown
    fi
  fi
  return 1  # not in cooldown
}

set_cooldown() {
  date +%s > "${COOLDOWN_FILE}"
}

# ── Check 1: Docker Desktop ─────────────────────────────────────────────────
check_docker_desktop() {
  if docker info &>/dev/null; then
    return 0
  fi

  log WARN "Docker Desktop is not responding"

  if is_in_cooldown; then
    log WARN "Docker restart skipped — cooldown active (last restart < ${COOLDOWN_SECONDS}s ago)"
    notify_critical "Docker Down" "Docker Desktop is not responding. Restart cooldown active — manual intervention needed."
    return 1
  fi

  notify_critical "Docker Down" "Docker Desktop crashed. Attempting auto-restart..."

  # Start Docker Desktop
  open -a "Docker" 2>/dev/null
  set_cooldown

  # Wait for Docker daemon to be ready
  local waited=0
  while ! docker info &>/dev/null; do
    sleep 5
    waited=$((waited + 5))
    if (( waited >= DOCKER_STARTUP_TIMEOUT )); then
      log ERROR "Docker Desktop failed to start within ${DOCKER_STARTUP_TIMEOUT}s"
      notify_critical "Docker Restart Failed" "Docker Desktop did not start within ${DOCKER_STARTUP_TIMEOUT}s. Manual intervention required!"
      return 1
    fi
  done

  log INFO "Docker Desktop restarted successfully after ${waited}s"
  notify "Docker Recovered" "Docker Desktop restarted after ${waited}s. Checking containers..."

  # After Docker restarts, containers with restart: unless-stopped should auto-start.
  # Give them 30s to come up before checking.
  sleep 30
  return 0
}

# ── Check 2: Required containers ─────────────────────────────────────────────
check_containers() {
  local all_running=true
  local down_containers=()

  for container in "${REQUIRED_CONTAINERS[@]}"; do
    local status
    status=$(docker inspect --format '{{.State.Status}}' "${container}" 2>/dev/null)
    if [[ "${status}" != "running" ]]; then
      all_running=false
      down_containers+=("${container}(${status:-missing})")
      log WARN "Container ${container} is not running (status: ${status:-not found})"
    fi
  done

  if ${all_running}; then
    return 0
  fi

  local down_list
  down_list=$(IFS=', '; echo "${down_containers[*]}")
  notify_critical "Containers Down" "${down_list}"

  # Attempt recovery via compose up
  log INFO "Attempting container recovery via compose up..."
  local compose_output
  compose_output=$(docker compose -p "${PROJECT_NAME}" -f "${COMPOSE_FILE}" up -d 2>&1)
  local rc=$?

  if (( rc == 0 )); then
    log INFO "Compose up succeeded: ${compose_output}"
    # Wait for health checks to pass
    sleep 15

    # Re-check
    local still_down=()
    for container in "${down_containers[@]}"; do
      local name="${container%%(*}"
      local status
      status=$(docker inspect --format '{{.State.Status}}' "${name}" 2>/dev/null)
      if [[ "${status}" != "running" ]]; then
        still_down+=("${name}")
      fi
    done

    if (( ${#still_down[@]} == 0 )); then
      log INFO "All containers recovered"
      notify "Containers Recovered" "All ${#REQUIRED_CONTAINERS[@]} containers are running"
      return 0
    else
      local still_list
      still_list=$(IFS=', '; echo "${still_down[*]}")
      log ERROR "Some containers failed to recover: ${still_list}"
      notify_critical "Recovery Partial" "Still down: ${still_list}. Manual intervention needed."
      return 1
    fi
  else
    log ERROR "Compose up failed (rc=${rc}): ${compose_output}"
    notify_critical "Recovery Failed" "docker compose up failed. Manual intervention needed."
    return 1
  fi
}

# ── Check 3: Health endpoints ────────────────────────────────────────────────
check_health_endpoints() {
  local all_healthy=true

  for entry in "${HEALTH_ENDPOINTS[@]}"; do
    local url="${entry%%|*}"
    local label="${entry##*|}"
    local http_code

    http_code=$(curl -s -o /dev/null -w '%{http_code}' --connect-timeout 5 --max-time 10 "${url}" 2>/dev/null)

    if [[ "${http_code}" == "200" ]]; then
      continue
    fi

    all_healthy=false
    log WARN "Health check failed: ${label} (${url}) — HTTP ${http_code}"
  done

  if ! ${all_healthy}; then
    # Don't auto-restart for health check failures — the containers are running
    # but the app might be starting up. Just notify.
    notify "Health Check Warning" "One or more endpoints not responding. May be starting up."
    return 1
  fi

  return 0
}

# ── Check 4: DNS resolution ──────────────────────────────────────────────────
check_dns_resolution() {
  local all_resolved=true
  local flush_needed=false

  for host in "${REQUIRED_DNS_HOSTS[@]}"; do
    # Test with the system resolver (what curl/browsers use)
    local local_result
    local_result=$(dig +short "${host}" A 2>/dev/null | head -1)

    if [[ -z "${local_result}" ]]; then
      # Local DNS failed — check if a public resolver can resolve it
      local public_result
      public_result=$(dig @1.1.1.1 +short "${host}" A 2>/dev/null | head -1)

      if [[ -n "${public_result}" ]]; then
        # Public resolver works, local doesn't → stale DNS cache
        log WARN "DNS stale for ${host}: local=NXDOMAIN, public=${public_result}"
        flush_needed=true
      else
        # Both fail → real DNS issue (record missing in Cloudflare)
        log ERROR "DNS missing for ${host}: no resolution on local or public (1.1.1.1) resolvers"
        all_resolved=false
        notify_critical "DNS Missing" "${host} has no DNS record. Check Cloudflare dashboard."
      fi
    fi
  done

  # Auto-flush macOS DNS cache if stale entries detected
  if ${flush_needed}; then
    local now
    now=$(date +%s)
    local last_flush=0
    [[ -f "${DNS_FLUSH_COOLDOWN_FILE}" ]] && last_flush=$(cat "${DNS_FLUSH_COOLDOWN_FILE}" 2>/dev/null || echo 0)

    if (( now - last_flush >= DNS_FLUSH_COOLDOWN_SECONDS )); then
      log INFO "Flushing macOS DNS cache (stale entries detected)"
      sudo -n dscacheutil -flushcache 2>/dev/null
      sudo -n killall -HUP mDNSResponder 2>/dev/null
      echo "${now}" > "${DNS_FLUSH_COOLDOWN_FILE}"
      notify "DNS Cache Flushed" "Stale DNS entries detected and auto-flushed. Re-checking next cycle."
    else
      log INFO "DNS flush skipped — cooldown active"
    fi

    all_resolved=false
  fi

  ${all_resolved}
}

# ── Check 5: External (public) health endpoints ─────────────────────────────
# Bypasses local DNS by resolving hostnames via 1.1.1.1 (Cloudflare public DNS).
# This gives an accurate picture of internet reachability regardless of local
# DNS cache state on the Mac Studio.
check_external_endpoints() {
  local all_healthy=true
  local failed_endpoints=()

  for entry in "${EXTERNAL_ENDPOINTS[@]}"; do
    local url="${entry%%|*}"
    local label="${entry##*|}"

    # Extract hostname from URL for --resolve
    local host
    host=$(echo "${url}" | sed -E 's|https?://([^/:]+).*|\1|')

    # Resolve via public DNS (1.1.1.1) to bypass local cache
    local resolved_ip
    resolved_ip=$(dig @1.1.1.1 +short "${host}" A 2>/dev/null | head -1)

    if [[ -z "${resolved_ip}" ]]; then
      all_healthy=false
      failed_endpoints+=("${label}(DNS FAIL)")
      log ERROR "External check: ${host} failed to resolve via public DNS (1.1.1.1)"
      continue
    fi

    local http_code
    http_code=$(curl -s -o /dev/null -w '%{http_code}' \
      --resolve "${host}:443:${resolved_ip}" \
      --connect-timeout 10 --max-time 15 "${url}" 2>/dev/null)

    if [[ "${http_code}" == "200" ]]; then
      continue
    fi

    all_healthy=false
    failed_endpoints+=("${label}(HTTP ${http_code})")
    log WARN "External health check failed: ${label} (${url}) — HTTP ${http_code} (resolved ${host}→${resolved_ip})"
  done

  if ! ${all_healthy}; then
    local fail_list
    fail_list=$(IFS=', '; echo "${failed_endpoints[*]}")

    # Check if local endpoints are fine — if so, the problem is DNS/tunnel, not containers
    local local_api_ok
    local_api_ok=$(curl -s -o /dev/null -w '%{http_code}' --connect-timeout 3 http://localhost:8000/health 2>/dev/null)

    if [[ "${local_api_ok}" == "200" ]]; then
      notify_critical "External Access Down" "${fail_list} — containers healthy but unreachable from internet. Check DNS/tunnel."
    else
      # Both local and external down — container issue (already handled by check_health_endpoints)
      log WARN "External endpoints down alongside local — container issue"
    fi
    return 1
  fi

  return 0
}

# ── Check 6: Verify restart policies ────────────────────────────────────────
check_restart_policies() {
  for container in "${REQUIRED_CONTAINERS[@]}"; do
    local policy
    policy=$(docker inspect --format '{{.HostConfig.RestartPolicy.Name}}' "${container}" 2>/dev/null)
    if [[ "${policy}" != "unless-stopped" ]]; then
      log WARN "Container ${container} has wrong restart policy: ${policy} (expected unless-stopped)"
      # This indicates containers were started outside of compose — flag it
      notify "Config Drift" "${container} has RestartPolicy=${policy}. Run full compose up to fix."
    fi
  done
}

# ── Check 7: Verify unified project ownership ───────────────────────────────
check_project_consistency() {
  for container in "${REQUIRED_CONTAINERS[@]}"; do
    local project
    project=$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' "${container}" 2>/dev/null)
    if [[ -n "${project}" && "${project}" != "${PROJECT_NAME}" ]]; then
      log WARN "Container ${container} belongs to project '${project}' instead of '${PROJECT_NAME}'"
      notify "Project Drift" "${container} is in project '${project}'. Run clean compose deploy to fix."
    fi
  done
}

# ── Main ─────────────────────────────────────────────────────────────────────
main() {
  rotate_log

  local overall_status="OK"
  local start_time
  start_time=$(date +%s)

  # Check 1: Docker Desktop
  if ! check_docker_desktop; then
    overall_status="CRITICAL"
    # If Docker is down, nothing else will work
    log ERROR "Monitor run complete: ${overall_status} (Docker Desktop down)"
    return 1
  fi

  # Check 2: Containers
  if ! check_containers; then
    overall_status="DEGRADED"
  fi

  # Check 3: Health endpoints (local)
  if ! check_health_endpoints; then
    if [[ "${overall_status}" == "OK" ]]; then
      overall_status="WARN"
    fi
  fi

  # Check 4: DNS resolution (with auto-flush)
  if ! check_dns_resolution; then
    if [[ "${overall_status}" == "OK" ]]; then
      overall_status="WARN"
    fi
  fi

  # Check 5: External endpoints (public internet path)
  if ! check_external_endpoints; then
    if [[ "${overall_status}" == "OK" || "${overall_status}" == "WARN" ]]; then
      overall_status="EXTERNAL_DOWN"
    fi
  fi

  # Check 6: Restart policies (advisory only)
  check_restart_policies

  # Check 7: Project consistency (advisory only)
  check_project_consistency

  local elapsed=$(( $(date +%s) - start_time ))
  log INFO "Monitor run complete: ${overall_status} (${elapsed}s)"
}

main "$@"
