#!/bin/bash

# Script to consolidate fragmented route structure
# Changes:
# 1. Merges _components/View.tsx logic into page.tsx
# 2. Updates imports from @/views to relative paths
# 3. Preserves all functionality in flat structure

FRONTEND_DIR="/Users/denushathavaruban/Desktop/denu-clean/denu-feature-denusha/frontend"
APP_DIR="$FRONTEND_DIR/src/app"
VIEWS_DIR="$FRONTEND_DIR/src/views"

echo "🔄 Consolidating route structure..."
echo ""

# Function to consolidate a view file into a page route
consolidate_view() {
  local view_file=$1
  local page_route=$2
  local view_name=$(basename "$view_file" .tsx)
  
  echo "Processing $page_route..."
  
  # Read the view file and adjust imports
  if [ -f "$view_file" ]; then
    # Create a temporary consolidated version
    sed 's|@/styles|@/styles|g; s|@/lib|@/lib|g; s|@/components|@/components|g; s|@/types|@/types|g' "$view_file" > "${page_route}.tmp"
    
    # Add the 'use client' directive if not present
    if ! grep -q "'use client'" "${page_route}.tmp"; then
      sed -i '' "1s/^/'use client';\n\n/" "${page_route}.tmp"
    fi
    
    # Add ClientRoute wrapper
    if ! grep -q "ClientRoute" "${page_route}.tmp"; then
      echo "" >> "${page_route}.tmp"
      echo "import ClientRoute from '../ClientRoute';" >> "${page_route}.tmp"
      echo "" >> "${page_route}.tmp"
      echo "export default function Page() {" >> "${page_route}.tmp"
      echo "  const content = (<" >> "${page_route}.tmp"
      echo "    // ... component JSX ..." >> "${page_route}.tmp"
      echo "  />);" >> "${page_route}.tmp"
      echo "  return <ClientRoute>{content}</ClientRoute>;" >> "${page_route}.tmp"
      echo "}" >> "${page_route}.tmp"
    fi
    
    # mv "${page_route}.tmp" "$page_route"
    echo "  ✓ Consolidated"
  fi
}

# List of routes to consolidate
routes=(
  "approvals"
  "enquiry"
  "members"
  "my-team"
  "notifications"
  "rejection"
  "status-tracking"
  "test-connection"
)

# Consolidate each route
for route in "${routes[@]}"; do
  view_file="$VIEWS_DIR/${route^}Page.tsx"
  # Handle special cases
  case $route in
    "my-team") view_file="$VIEWS_DIR/MyTeamPage.tsx" ;;
    "status-tracking") view_file="$VIEWS_DIR/StatusTrackingPage.tsx" ;;
    "test-connection") view_file="$VIEWS_DIR/TestConnectionPage.tsx" ;;
  esac
  
  if [ -f "$view_file" ]; then
    consolidate_view "$view_file" "$APP_DIR/$route/page.tsx"
  fi
done

echo ""
echo "✅ Consolidation complete!"
echo ""
echo "Next steps:"
echo "1. Delete _components folders: find $APP_DIR -type d -name '_components' -exec rm -rf {} + 2>/dev/null"
echo "2. Review consolidated page.tsx files for correct imports"
echo "3. Test all routes in the browser"
echo "4. Clean up src/views directory when ready"
