# Kiosk Lock Feature Documentation

## Overview

The Kiosk Lock feature allows administrators to restrict customer access to specific categories or all categories during defined time periods. This is useful for managing kitchen capacity, special hours, or temporary menu restrictions.

---

## Features

### 1. Flexible Locking Options
- **Lock All Categories**: Prevent all online orders during specific times
- **Lock Specific Categories**: Restrict only certain categories while keeping others available

### 2. Time-Based Scheduling
- Set specific time ranges (e.g., 12:30 AM to 12:30 PM)
- Support for time ranges that span midnight (e.g., 11:00 PM to 2:00 AM)
- Multiple lock schedules can run simultaneously

### 3. Day-Based Restrictions
- Select specific days of the week for locks to apply
- Leave empty to apply lock every day
- Full week coverage (Sunday - Saturday)

### 4. Real-Time Enforcement
- Locked categories are immediately hidden from customer view
- Clear messaging when categories are unavailable
- Automatic unlock when time period expires

---

## Database Schema

### Table: `kiosk_lock_settings`

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `name` | text | Descriptive name for the lock rule |
| `lock_type` | text | 'all' or 'specific' |
| `locked_category_ids` | uuid[] | Array of category IDs to lock |
| `start_time` | time | Daily start time for lock |
| `end_time` | time | Daily end time for lock |
| `days_of_week` | integer[] | Days when lock is active (0-6) |
| `is_active` | boolean | Whether lock is currently enabled |
| `created_at` | timestamptz | Creation timestamp |
| `updated_at` | timestamptz | Last update timestamp |

### Database Functions

#### `get_locked_category_ids()`
Returns an array of currently locked category IDs based on active lock rules and current time/day.

```sql
SELECT get_locked_category_ids();
-- Returns: ['uuid1', 'uuid2', ...]
```

#### `is_category_locked(category_id uuid)`
Checks if a specific category is currently locked.

```sql
SELECT is_category_locked('your-category-uuid-here');
-- Returns: true or false
```

---

## Admin Interface

### Accessing Kiosk Lock Settings

1. Log in to the admin panel
2. Navigate to **Kiosk Lock** in the sidebar menu
3. View all existing lock rules

### Creating a Lock Rule

1. Click **"Add Lock Rule"** button
2. Fill in the required information:
   - **Rule Name**: Descriptive name (e.g., "Lunch Break Lock")
   - **Lock Type**: Choose between:
     - Lock All Categories
     - Lock Specific Categories
   - **Categories**: If specific, select which categories to lock
   - **Time Range**: Set start and end times
   - **Days of Week**: Select applicable days (optional)
   - **Active**: Enable or disable the rule immediately
3. Click **"Create Lock Rule"**

### Editing a Lock Rule

1. Click the edit icon (pencil) next to any lock rule
2. Modify the desired fields
3. Click **"Update Lock Rule"**

### Deleting a Lock Rule

1. Click the delete icon (trash) next to any lock rule
2. Confirm the deletion
3. The rule is permanently removed

### Toggling Lock Status

- Click the status badge (Active/Inactive) to quickly enable or disable a lock
- Inactive locks remain in the system but don't affect customer ordering

---

## Customer Experience

### When Categories Are Locked

#### All Categories Locked
- Customers see a message: "No Categories Available"
- Message explains: "All categories are currently locked"
- Instructions to check back later

#### Specific Categories Locked
- Locked categories are hidden from the category list
- Only available categories are shown
- If customer somehow selects a locked category:
  - "Category Locked" message is displayed
  - Explains the category is temporarily unavailable
  - Suggests selecting another category

### When Categories Are Unlocked

- Categories automatically become available again
- No manual intervention required
- Seamless transition for customers

---

## Use Cases

### Example 1: Lunch Break Lock
**Scenario**: Restaurant kitchen takes a break from 2:30 PM to 3:30 PM

**Setup**:
- Name: "Kitchen Break - Afternoon"
- Lock Type: All Categories
- Start Time: 14:30 (2:30 PM)
- End Time: 15:30 (3:30 PM)
- Days: Monday through Friday
- Status: Active

### Example 2: Weekend Pizza Special
**Scenario**: Pizza category only available on weekends

**Setup** (Inverse Lock):
- Name: "Weekday Pizza Lock"
- Lock Type: Specific Categories
- Categories: Pizza
- Start Time: 00:00 (12:00 AM)
- End Time: 23:59 (11:59 PM)
- Days: Monday, Tuesday, Wednesday, Thursday, Friday
- Status: Active

### Example 3: Late Night Limited Menu
**Scenario**: Only snacks and drinks available after 11 PM

**Setup**:
- Name: "Late Night - Main Menu Lock"
- Lock Type: Specific Categories
- Categories: Main Dishes, Specials, Family Packs
- Start Time: 23:00 (11:00 PM)
- End Time: 06:00 (6:00 AM)
- Days: All days (empty array)
- Status: Active

### Example 4: Preparation Time Lock
**Scenario**: Lock complex items during peak hours (12:00 PM - 1:00 PM)

**Setup**:
- Name: "Lunch Rush - Complex Items"
- Lock Type: Specific Categories
- Categories: Specialty Items, Custom Orders
- Start Time: 12:00 (12:00 PM)
- End Time: 13:00 (1:00 PM)
- Days: Monday through Friday
- Status: Active

---

## Technical Implementation

### Frontend Components

#### Admin Interface (`/admin/kiosk-lock`)
- **File**: `src/pages/admin/KioskLock.tsx`
- **Features**:
  - List all lock rules
  - Create/Edit/Delete lock rules
  - Toggle active status
  - Category selection
  - Time and day selection

#### Menu Screen Integration
- **File**: `src/pages/MenuScreen.tsx`
- **Features**:
  - Fetches locked category IDs on load
  - Filters out locked categories from display
  - Shows appropriate messages when categories are locked
  - Auto-selects available categories

### Backend Functions

#### SQL Functions
Located in migration: `add_kiosk_lock_system.sql`

1. **`is_category_locked(category_id uuid)`**
   - Checks if specific category is currently locked
   - Considers time, day, and active status
   - Returns boolean

2. **`get_locked_category_ids()`**
   - Returns array of all currently locked category IDs
   - Handles "lock all" rules
   - Considers time and day constraints

3. **`update_kiosk_lock_updated_at()`**
   - Trigger function
   - Updates `updated_at` timestamp on modifications

### Security (RLS Policies)

#### Public Access
- Anyone can view **active** lock settings (needed to check availability)
- Read-only access to is_active=true records

#### Admin Access
- Admins can view all lock settings (active and inactive)
- Admins can create new lock rules
- Admins can update existing lock rules
- Admins can delete lock rules

---

## API Usage

### Checking Locked Categories (Frontend)

```typescript
// Fetch currently locked category IDs
const { data, error } = await supabase.rpc('get_locked_category_ids');
const lockedCategoryIds: string[] = data || [];

// Filter available categories
const availableCategories = allCategories.filter(
  cat => !lockedCategoryIds.includes(cat.id)
);
```

### Checking if Specific Category is Locked

```typescript
const { data } = await supabase.rpc('is_category_locked', {
  category_id_param: 'your-category-uuid'
});
const isLocked: boolean = data;
```

### Creating a Lock Rule

```typescript
const { error } = await supabase
  .from('kiosk_lock_settings')
  .insert([{
    name: 'Lunch Break Lock',
    lock_type: 'all',
    locked_category_ids: [],
    start_time: '14:30:00',
    end_time: '15:30:00',
    days_of_week: [1, 2, 3, 4, 5], // Mon-Fri
    is_active: true
  }]);
```

### Updating a Lock Rule

```typescript
const { error } = await supabase
  .from('kiosk_lock_settings')
  .update({ is_active: false })
  .eq('id', lockId);
```

---

## Time Zone Considerations

- All times are stored as `time` type (no timezone)
- Times are interpreted in the server's local timezone
- Uses PostgreSQL's `CURRENT_TIME` for comparison
- Consider server timezone when setting lock times

---

## Troubleshooting

### Lock Not Working

**Check:**
1. Is the lock rule active? (Status should be "Active")
2. Is the current day in the `days_of_week` array?
3. Is the current time within start_time and end_time?
4. Are you testing with admin account? (Admins may have different access)

### Categories Not Showing

**Check:**
1. Are the categories marked as `is_active` in the database?
2. Are the categories actually locked? Check `get_locked_category_ids()`
3. Are there products in those categories?
4. Check browser console for errors

### Time Range Spanning Midnight

**Example**: Lock from 11:00 PM to 2:00 AM

```sql
-- This works correctly:
start_time: '23:00:00'
end_time: '02:00:00'

-- The function handles this logic:
-- If current_time >= 23:00 OR current_time <= 02:00, then locked
```

### All Days vs Specific Days

- **Empty array** `[]` = Applies every day
- **Specific days** `[0, 6]` = Only Sunday and Saturday
- Days: 0=Sunday, 1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday, 6=Saturday

---

## Performance Considerations

- Indexes created on:
  - `is_active` (for fast active lock queries)
  - `locked_category_ids` (GIN index for array operations)
- Functions use `STABLE` optimization
- Minimal database calls from frontend
- Lock check happens once per page load

---

## Future Enhancements

Potential improvements for future versions:

1. **Date Ranges**: Lock categories for specific date ranges (holidays, events)
2. **Exception Dates**: Allow specific dates to override regular schedules
3. **Lock Templates**: Save and reuse common lock configurations
4. **Notification System**: Alert admins when locks activate/deactivate
5. **Analytics**: Track how often locks are active and customer impact
6. **Product-Level Locks**: Lock individual products instead of entire categories
7. **Automatic Scheduling**: AI-based suggestions based on order patterns
8. **Customer Notifications**: Inform customers when locked items become available

---

## Testing

### Manual Testing Steps

1. **Create a lock rule** for current time + 1 minute
2. **Wait for lock to activate**
3. **Check menu screen** - category should disappear
4. **Verify lock message** is displayed
5. **Wait for lock to expire**
6. **Verify category reappears**

### Test Cases

#### Test Case 1: All Categories Lock
- Create lock_type='all' rule
- Verify no categories visible during lock period
- Verify "No Categories Available" message

#### Test Case 2: Specific Category Lock
- Create lock_type='specific' with one category
- Verify only that category is hidden
- Verify other categories remain available

#### Test Case 3: Time Spanning Midnight
- Create lock from 23:00 to 02:00
- Test at 23:30 (should be locked)
- Test at 01:00 (should be locked)
- Test at 03:00 (should be unlocked)

#### Test Case 4: Day-Specific Lock
- Create lock for Monday only
- Test on Monday (should be locked)
- Test on Tuesday (should be unlocked)

---

## Migration Information

**Migration File**: `20260401XXXXXX_add_kiosk_lock_system.sql`

**Applied**: Automatically via Supabase migration system

**Rollback**: To remove this feature:
```sql
DROP FUNCTION IF EXISTS get_locked_category_ids();
DROP FUNCTION IF EXISTS is_category_locked(uuid);
DROP FUNCTION IF EXISTS update_kiosk_lock_updated_at();
DROP TRIGGER IF EXISTS trigger_update_kiosk_lock_timestamp ON kiosk_lock_settings;
DROP TABLE IF EXISTS kiosk_lock_settings;
```

---

## Summary

The Kiosk Lock feature provides powerful, flexible control over when customers can order from specific categories. It's designed to be:

- **Easy to use**: Simple admin interface
- **Flexible**: Multiple scheduling options
- **Reliable**: Real-time enforcement
- **Secure**: Proper RLS policies
- **Performant**: Optimized database queries

Perfect for managing kitchen capacity, special hours, and menu availability!
