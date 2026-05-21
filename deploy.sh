#!/bin/bash
# ── Deploy to cPanel shared hosting ──
# Remote: investmq@85.187.128.56:/home/investmq/public_html/myproperty

set -e

REMOTE_USER="investmq"
REMOTE_HOST="85.187.128.56"
REMOTE_PATH="/home/investmq/public_html/myproperty"
LOCAL_PATH="/Users/ivanchang/malaysia-property/"
SSH_KEY="$HOME/.ssh/a2hosting_key"
SSH_OPTS="-i ${SSH_KEY} -o ConnectTimeout=10 -o BatchMode=yes"

echo "=== Deploying to ${REMOTE_HOST}:${REMOTE_PATH} ==="
echo ""

# 1. Check SSH key exists
if [ ! -f "${SSH_KEY}" ]; then
    echo "ERROR: SSH key not found at ${SSH_KEY}"
    exit 1
fi

# 2. Test connectivity
echo "[1/2] Testing SSH connection..."
if ! ssh ${SSH_OPTS} "${REMOTE_USER}@${REMOTE_HOST}" echo "connected" >/dev/null 2>&1; then
    echo ""
    echo "ERROR: SSH connection failed."
    echo ""
    echo "Possible causes:"
    echo "  1. Host key not trusted → run: ssh -i ${SSH_KEY} ${REMOTE_USER}@${REMOTE_HOST}"
    echo "     and type 'yes' when prompted"
    echo "  2. SSH key not authorized on server → copy key:"
    echo "     ssh-copy-id -i ${SSH_KEY} ${REMOTE_USER}@${REMOTE_HOST}"
    echo "  3. Key permissions wrong → run: chmod 600 ${SSH_KEY}"
    echo "  4. Firewall blocking port 22 → check: nc -zv ${REMOTE_HOST} 22"
    echo "  5. Wrong IP/username → verify in cPanel > General Information"
    echo ""
    exit 1
fi
echo "  SSH OK"

# 3. Rsync
echo "[2/2] Syncing files..."
rsync -avz --progress --delete \
    -e "ssh -i ${SSH_KEY}" \
    --exclude='.git/' \
    --exclude='scripts/' \
    --exclude='deploy.sh' \
    --exclude='README.md' \
    --exclude='CLAUDE.md' \
    --exclude='.gitignore' \
    --exclude='*.zip' \
    --exclude='*.py' \
    --exclude='.DS_Store' \
    --exclude='node_modules/' \
    "${LOCAL_PATH}" "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_PATH}"

echo ""
echo "=== Deploy complete ==="
echo "Site: https://myproperty.investmquest.com/"
