#!/bin/bash
# Test Premium Module System

API_URL="http://localhost:8001"

# Get JWT token (replace with actual credentials)
echo "1. Testing available modules endpoint..."
curl -s "$API_URL/billing/modules/available" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" | jq '.'

echo -e "\n2. Testing company modules endpoint..."
curl -s "$API_URL/billing/modules/company" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" | jq '.'

echo -e "\n3. Testing module access check (MASTER_COSTBOOK)..."
curl -s "$API_URL/billing/modules/MASTER_COSTBOOK/check" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" | jq '.'

echo -e "\n4. Testing module access check (GOLDEN_PETL)..."
curl -s "$API_URL/billing/modules/GOLDEN_PETL/check" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" | jq '.'

echo -e "\n5. Testing module access check (GOLDEN_BOM)..."
curl -s "$API_URL/billing/modules/GOLDEN_BOM/check" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" | jq '.'

echo -e "\nDone!"
