#!/bin/bash
# Test harness for all Nexus MCP tools
# Sends JSON-RPC requests via stdin to the MCP server

cd "$(dirname "$0")/.."

ID=0
PASS=0
FAIL=0
RESULTS=""

call_tool() {
  local label="$1"
  local name="$2"
  local args="$3"
  ID=$((ID + 1))

  local request="{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"id\":$ID,\"params\":{\"name\":\"$name\",\"arguments\":$args}}"
  local result
  result=$(echo "$request" | node mcp/dist/index.js 2>/dev/null)

  # Extract the text content from the response
  local text
  text=$(echo "$result" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    content = data.get('result', {}).get('content', [{}])
    text = content[0].get('text', '') if content else ''
    print(text[:500])
except:
    print('PARSE_ERROR')
" 2>/dev/null)

  if echo "$text" | grep -qi "error\|PARSE_ERROR\|failed"; then
    FAIL=$((FAIL + 1))
    RESULTS+="  FAIL  $label: $(echo "$text" | head -1)\n"
    echo "  FAIL  $label"
  else
    PASS=$((PASS + 1))
    RESULTS+="  PASS  $label: $(echo "$text" | head -1)\n"
    echo "  PASS  $label"
  fi

  # Return raw text for extraction
  echo "$text" > /tmp/mcp-last-result.txt
}

echo "=== Testing Nexus MCP Server - All 28 Tools ==="
echo ""

# ---- 1. list_agents (empty) ----
echo "--- Agents ---"
call_tool "list_agents (empty)" "list_agents" "{}"

# ---- 2. list_cell_types ----
echo "--- Cell Types ---"
call_tool "list_cell_types" "list_cell_types" "{}"

# ---- 3. create_agent ----
echo "--- Create Agent ---"
call_tool "create_agent" "create_agent" "{\"name\":\"mcp-test-agent\",\"cellType\":\"cli\"}"

# Extract the agent ID from create result
AGENT_ID=$(cat /tmp/mcp-last-result.txt | python3 -c "
import sys, json
try:
    data = json.loads(sys.stdin.read())
    print(data['agent']['id'])
except:
    print('')
" 2>/dev/null)

if [ -z "$AGENT_ID" ]; then
  echo "FATAL: Could not extract agent ID from create_agent response"
  cat /tmp/mcp-last-result.txt
  exit 1
fi
echo "  Agent ID: $AGENT_ID"

# ---- 4. get_agent ----
call_tool "get_agent" "get_agent" "{\"agentId\":\"$AGENT_ID\"}"

# ---- 5. update_agent ----
call_tool "update_agent" "update_agent" "{\"agentId\":\"$AGENT_ID\",\"name\":\"mcp-test-agent-renamed\"}"

# ---- 6. get_agent_status ----
call_tool "get_agent_status" "get_agent_status" "{\"agentId\":\"$AGENT_ID\"}"

# ---- 7. list_agents (should have 1) ----
call_tool "list_agents (with agent)" "list_agents" "{}"

# ---- 8. start_agent ----
echo "--- Start/Stop ---"
call_tool "start_agent" "start_agent" "{\"agentId\":\"$AGENT_ID\"}"

# Wait a moment for the agent to fully start
sleep 3

# ---- 9. get_agent_status (running) ----
call_tool "get_agent_status (running)" "get_agent_status" "{\"agentId\":\"$AGENT_ID\"}"

# ---- 10. send_message ----
echo "--- Messaging ---"
call_tool "send_message" "send_message" "{\"agentId\":\"$AGENT_ID\",\"message\":\"Hello from MCP test\"}"

# Wait for message processing
sleep 2

# ---- 11. get_messages ----
call_tool "get_messages" "get_messages" "{\"agentId\":\"$AGENT_ID\"}"

# ---- 12. get_queue_stats ----
call_tool "get_queue_stats" "get_queue_stats" "{\"agentId\":\"$AGENT_ID\"}"

# ---- 13. read_workspace (tree) ----
echo "--- Files ---"
call_tool "read_workspace (tree)" "read_workspace" "{\"agentId\":\"$AGENT_ID\"}"

# ---- 14. read_ledger (tree) ----
call_tool "read_ledger (tree)" "read_ledger" "{\"agentId\":\"$AGENT_ID\"}"

# ---- 15. write_ledger ----
call_tool "write_ledger" "write_ledger" "{\"agentId\":\"$AGENT_ID\",\"path\":\"test-file.md\",\"content\":\"# MCP Test\\nThis file was written by the MCP test harness.\"}"

# ---- 16. read_ledger (file) ----
call_tool "read_ledger (file)" "read_ledger" "{\"agentId\":\"$AGENT_ID\",\"path\":\"test-file.md\"}"

# ---- 17. get_system_prompt ----
call_tool "get_system_prompt" "get_system_prompt" "{\"agentId\":\"$AGENT_ID\"}"

# ---- 18. manage_skills (create) ----
echo "--- Skills ---"
call_tool "manage_skills (create)" "manage_skills" "{\"action\":\"create\",\"agentId\":\"$AGENT_ID\",\"name\":\"test-skill\",\"content\":\"You are a test skill.\",\"description\":\"A test skill\"}"

# ---- 19. manage_skills (list) ----
call_tool "manage_skills (list)" "manage_skills" "{\"action\":\"list\",\"agentId\":\"$AGENT_ID\"}"

# ---- 20. manage_skills (get) ----
call_tool "manage_skills (get)" "manage_skills" "{\"action\":\"get\",\"agentId\":\"$AGENT_ID\",\"name\":\"test-skill\"}"

# ---- 21. manage_skills (update) ----
call_tool "manage_skills (update)" "manage_skills" "{\"action\":\"update\",\"agentId\":\"$AGENT_ID\",\"name\":\"test-skill\",\"content\":\"Updated test skill content.\"}"

# ---- 22. manage_skills (delete) ----
call_tool "manage_skills (delete)" "manage_skills" "{\"action\":\"delete\",\"agentId\":\"$AGENT_ID\",\"name\":\"test-skill\"}"

# ---- 23. manage_cron (create) ----
echo "--- Cron ---"
call_tool "manage_cron (create)" "manage_cron" "{\"action\":\"create\",\"agentId\":\"$AGENT_ID\",\"name\":\"test-cron\",\"scheduleType\":\"every\",\"scheduleValue\":\"120000\",\"message\":\"Cron test ping\"}"

# Extract job ID
CRON_JOB_ID=$(cat /tmp/mcp-last-result.txt | python3 -c "
import sys, json
try:
    data = json.loads(sys.stdin.read())
    print(data['job']['id'])
except:
    print('')
" 2>/dev/null)
echo "  Cron Job ID: $CRON_JOB_ID"

# ---- 24. manage_cron (list) ----
call_tool "manage_cron (list)" "manage_cron" "{\"action\":\"list\",\"agentId\":\"$AGENT_ID\"}"

# ---- 25. manage_cron (update) ----
if [ -n "$CRON_JOB_ID" ]; then
  call_tool "manage_cron (update)" "manage_cron" "{\"action\":\"update\",\"agentId\":\"$AGENT_ID\",\"jobId\":\"$CRON_JOB_ID\",\"enabled\":false}"
fi

# ---- 26. manage_cron (trigger) ----
if [ -n "$CRON_JOB_ID" ]; then
  call_tool "manage_cron (trigger)" "manage_cron" "{\"action\":\"trigger\",\"agentId\":\"$AGENT_ID\",\"jobId\":\"$CRON_JOB_ID\"}"
fi

# ---- 27. get_cron_history ----
call_tool "get_cron_history" "get_cron_history" "{\"agentId\":\"$AGENT_ID\"}"

# ---- 28. manage_cron (delete) ----
if [ -n "$CRON_JOB_ID" ]; then
  call_tool "manage_cron (delete)" "manage_cron" "{\"action\":\"delete\",\"agentId\":\"$AGENT_ID\",\"jobId\":\"$CRON_JOB_ID\"}"
fi

# ---- 29. manage_teams (create) ----
echo "--- Teams ---"
call_tool "manage_teams (create)" "manage_teams" "{\"action\":\"create\",\"name\":\"mcp-test-team\",\"description\":\"Test team from MCP\"}"

TEAM_ID=$(cat /tmp/mcp-last-result.txt | python3 -c "
import sys, json
try:
    data = json.loads(sys.stdin.read())
    print(data['team']['id'])
except:
    print('')
" 2>/dev/null)
echo "  Team ID: $TEAM_ID"

# ---- 30. manage_teams (list) ----
call_tool "manage_teams (list)" "manage_teams" "{\"action\":\"list\"}"

# ---- 31. manage_teams (get) ----
if [ -n "$TEAM_ID" ]; then
  call_tool "manage_teams (get)" "manage_teams" "{\"action\":\"get\",\"teamId\":\"$TEAM_ID\"}"
fi

# ---- 32. manage_teams (update) ----
if [ -n "$TEAM_ID" ]; then
  call_tool "manage_teams (update)" "manage_teams" "{\"action\":\"update\",\"teamId\":\"$TEAM_ID\",\"description\":\"Updated test team\"}"
fi

# ---- 33. manage_team_members (add) ----
echo "--- Team Members ---"
if [ -n "$TEAM_ID" ]; then
  call_tool "manage_team_members (add)" "manage_team_members" "{\"action\":\"add\",\"teamId\":\"$TEAM_ID\",\"agentId\":\"$AGENT_ID\"}"
fi

# ---- 34. send_mail ----
echo "--- Mailbox ---"
if [ -n "$TEAM_ID" ]; then
  call_tool "send_mail" "send_mail" "{\"teamId\":\"$TEAM_ID\",\"agentId\":\"$AGENT_ID\",\"subject\":\"MCP Test Mail\",\"body\":\"Hello from the MCP test harness!\"}"
fi

# ---- 35. get_mailbox (list) ----
if [ -n "$TEAM_ID" ]; then
  call_tool "get_mailbox (list)" "get_mailbox" "{\"action\":\"list\",\"teamId\":\"$TEAM_ID\"}"
fi

# Extract a message ID for mark_read
MAIL_MSG_ID=$(cat /tmp/mcp-last-result.txt | python3 -c "
import sys, json
try:
    data = json.loads(sys.stdin.read())
    msgs = data.get('messages', [])
    if msgs:
        print(msgs[0]['id'])
    else:
        print('')
except:
    print('')
" 2>/dev/null)

# ---- 36. get_mailbox (mark_read) ----
if [ -n "$TEAM_ID" ] && [ -n "$MAIL_MSG_ID" ]; then
  call_tool "get_mailbox (mark_read)" "get_mailbox" "{\"action\":\"mark_read\",\"teamId\":\"$TEAM_ID\",\"messageId\":\"$MAIL_MSG_ID\"}"
fi

# ---- 37. get_mailbox (mark_all_read) ----
if [ -n "$TEAM_ID" ]; then
  call_tool "get_mailbox (mark_all_read)" "get_mailbox" "{\"action\":\"mark_all_read\",\"teamId\":\"$TEAM_ID\"}"
fi

# ---- 38. get_mailbox (unread_counts) ----
call_tool "get_mailbox (unread_counts)" "get_mailbox" "{\"action\":\"unread_counts\"}"

# ---- 39. manage_team_members (remove) ----
if [ -n "$TEAM_ID" ]; then
  call_tool "manage_team_members (remove)" "manage_team_members" "{\"action\":\"remove\",\"teamId\":\"$TEAM_ID\",\"agentId\":\"$AGENT_ID\"}"
fi

# ---- 40. manage_volumes (list) ----
echo "--- Volumes ---"
call_tool "manage_volumes (list)" "manage_volumes" "{\"action\":\"list\"}"

# Get a volume ID from the agent's volumes
VOL_ID=$(cat /tmp/mcp-last-result.txt | python3 -c "
import sys, json
try:
    data = json.loads(sys.stdin.read())
    vols = data.get('volumes', [])
    if vols:
        print(vols[0]['id'])
    else:
        print('')
except:
    print('')
" 2>/dev/null)

# ---- 41. manage_volumes (get) ----
if [ -n "$VOL_ID" ]; then
  call_tool "manage_volumes (get)" "manage_volumes" "{\"action\":\"get\",\"volumeId\":\"$VOL_ID\"}"
fi

# ---- 42. manage_volumes (create) ----
call_tool "manage_volumes (create)" "manage_volumes" "{\"action\":\"create\",\"name\":\"mcp-test-vol\",\"type\":\"ledger\",\"description\":\"Test volume from MCP\"}"

NEW_VOL_ID=$(cat /tmp/mcp-last-result.txt | python3 -c "
import sys, json
try:
    data = json.loads(sys.stdin.read())
    print(data['volume']['id'])
except:
    print('')
" 2>/dev/null)
echo "  New Volume ID: $NEW_VOL_ID"

# ---- 43. manage_volumes (clone) ----
if [ -n "$NEW_VOL_ID" ]; then
  call_tool "manage_volumes (clone)" "manage_volumes" "{\"action\":\"clone\",\"volumeId\":\"$NEW_VOL_ID\",\"name\":\"mcp-test-vol-clone\"}"

  CLONE_VOL_ID=$(cat /tmp/mcp-last-result.txt | python3 -c "
import sys, json
try:
    data = json.loads(sys.stdin.read())
    print(data['volume']['id'])
except:
    print('')
" 2>/dev/null)
fi

# ---- 44. manage_volumes (delete cloned) ----
if [ -n "$CLONE_VOL_ID" ]; then
  call_tool "manage_volumes (delete clone)" "manage_volumes" "{\"action\":\"delete\",\"volumeId\":\"$CLONE_VOL_ID\"}"
fi

# ---- 45. manage_volumes (delete created) ----
if [ -n "$NEW_VOL_ID" ]; then
  call_tool "manage_volumes (delete created)" "manage_volumes" "{\"action\":\"delete\",\"volumeId\":\"$NEW_VOL_ID\"}"
fi

# ---- 46. get_invocation_history ----
echo "--- History ---"
call_tool "get_invocation_history" "get_invocation_history" "{\"agentId\":\"$AGENT_ID\"}"

# ---- 47. get_raw_logs ----
call_tool "get_raw_logs" "get_raw_logs" "{\"agentId\":\"$AGENT_ID\"}"

# ---- 48. cancel_agent_task ----
echo "--- Cancel ---"
call_tool "cancel_agent_task" "cancel_agent_task" "{\"agentId\":\"$AGENT_ID\"}"

# ---- 49. clear_session ----
call_tool "clear_session" "clear_session" "{\"agentId\":\"$AGENT_ID\"}"

# ---- 50. stop_agent ----
echo "--- Cleanup ---"
call_tool "stop_agent" "stop_agent" "{\"agentId\":\"$AGENT_ID\"}"
sleep 2

# ---- 51. manage_teams (delete) ----
if [ -n "$TEAM_ID" ]; then
  call_tool "manage_teams (delete)" "manage_teams" "{\"action\":\"delete\",\"teamId\":\"$TEAM_ID\"}"
fi

# ---- 52. delete_agent ----
call_tool "delete_agent" "delete_agent" "{\"agentId\":\"$AGENT_ID\",\"deleteVolumes\":true}"

echo ""
echo "=== Results ==="
echo "  Passed: $PASS"
echo "  Failed: $FAIL"
echo "  Total:  $((PASS + FAIL))"
echo ""
echo "--- Detail ---"
echo -e "$RESULTS"

# Cleanup
rm -f /tmp/mcp-last-result.txt
