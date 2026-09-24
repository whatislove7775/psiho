#!/bin/sh
# Starts coturn with or without TLS depending on cert availability.
# When LetsEncrypt certs don't exist yet (first boot before certbot runs),
# coturn still works on plain UDP/TCP port 3478 for STUN and TURN relay.

CERT="/etc/letsencrypt/live/aprosop.ru/fullchain.pem"
PKEY="/etc/letsencrypt/live/aprosop.ru/privkey.pem"

if [ -f "$CERT" ] && [ -f "$PKEY" ]; then
  echo "[coturn] TLS certs found — starting with TLS on port 5349"
  exec turnserver \
    -n \
    --realm=aprosop.ru \
    --user="${TURN_USER:-aprosop}:${TURN_PASSWORD:-aprosopsecretturn}" \
    --lt-cred-mech \
    --fingerprint \
    --listening-port=3478 \
    --tls-listening-port=5349 \
    --cert="$CERT" \
    --pkey="$PKEY" \
    --min-port=49152 \
    --max-port=65535 \
    --log-file=stdout \
    --no-cli \
    --no-rfc5780 \
    --no-loopback-peers \
    --no-multicast-peers \
    --denied-peer-ip=0.0.0.0-0.255.255.255 \
    --denied-peer-ip=10.0.0.0-10.255.255.255 \
    --denied-peer-ip=127.0.0.0-127.255.255.255 \
    --denied-peer-ip=172.16.0.0-172.31.255.255 \
    --denied-peer-ip=192.168.0.0-192.168.255.255
else
  echo "[coturn] WARNING: TLS certs not found at $CERT"
  echo "[coturn] Starting without TLS (plain TURN on port 3478 only)"
  echo "[coturn] Run fix-ssl.sh then 'docker compose restart coturn' to enable TLS"
  exec turnserver \
    -n \
    --realm=aprosop.ru \
    --user="${TURN_USER:-aprosop}:${TURN_PASSWORD:-aprosopsecretturn}" \
    --lt-cred-mech \
    --fingerprint \
    --listening-port=3478 \
    --min-port=49152 \
    --max-port=65535 \
    --log-file=stdout \
    --no-cli \
    --no-rfc5780 \
    --no-loopback-peers \
    --no-multicast-peers \
    --denied-peer-ip=0.0.0.0-0.255.255.255 \
    --denied-peer-ip=10.0.0.0-10.255.255.255 \
    --denied-peer-ip=127.0.0.0-127.255.255.255 \
    --denied-peer-ip=172.16.0.0-172.31.255.255 \
    --denied-peer-ip=192.168.0.0-192.168.255.255
fi
