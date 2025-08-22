# Admin Dashboard Setup Guide

This guide explains how to set up the admin dashboard for the ContactOut Dialer application.

## Overview

The admin dashboard provides:

- Real-time call statistics
- User activity tracking
- Call success/failure analytics
- User performance metrics

## Database Setup

### 1. Supabase Migration

Run the following SQL migration in your Supabase SQL editor:

```sql
-- The migration file is located at: supabase/migrations/001_create_tables.sql
-- Copy and paste the contents of that file into your Supabase SQL editor
```

### 2. Database Tables

The migration creates two main tables:

#### `users` table

- Tracks user statistics and call counts
- Automatically updated when calls are made
- Includes total calls, successful calls, failed calls, and last active time

#### `calls` table

- Records individual call details
- Tracks call status, phone numbers, and timestamps
- Links to user accounts for analytics

### 3. Row Level Security (RLS)

The tables are protected with RLS policies:

- Users can only see their own data
- Admins can see all user data
- Admin access is determined by email containing 'admin' or role metadata

## Admin Access

### Admin User Requirements

To access the admin dashboard, a user must meet one of these criteria:

1. Email contains 'admin' (e.g., `admin@contactout.com`)
2. User metadata has `role: 'admin'`

### Setting Admin Role

You can set a user as admin by updating their metadata in Supabase:

```sql
UPDATE auth.users
SET raw_user_meta_data = jsonb_set(
  raw_user_meta_data,
  '{role}',
  '"admin"'
)
WHERE email = 'your-admin-email@contactout.com';
```

## Usage

### Accessing the Dashboard

Navigate to `/admin` in your application. The dashboard will:

1. Check if the user is authenticated
2. Verify admin privileges
3. Display call statistics and user metrics

### Features

#### Overview Statistics

- Total calls across all users
- Successful vs. failed call counts
- Total registered users
- Active users today

#### User Statistics Table

- Individual user performance metrics
- Call success rates with visual indicators
- Last activity timestamps
- Sortable by call volume

### Data Refresh

The dashboard includes a refresh button to fetch the latest data from the database.

## Integration

### Call Tracking

The application automatically tracks calls when:

- A call is initiated (status: 'incoming')
- A call completes successfully (status: 'completed')
- A call fails (status: 'failed')

### User Activity

User activity is automatically updated:

- Last active time is recorded on each call
- Call counts are incremented in real-time
- Statistics are calculated automatically

## Troubleshooting

### Common Issues

1. **Access Denied Error**

   - Ensure user email contains 'admin' or has admin role
   - Check user authentication status

2. **No Data Displayed**

   - Verify database tables exist
   - Check RLS policies are properly configured
   - Ensure users have made calls to generate data

3. **Database Connection Errors**
   - Verify Supabase credentials in environment variables
   - Check database connection status

### Environment Variables

Ensure these are set in your `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

## Security Considerations

- Admin access is restricted to specific users
- RLS policies prevent unauthorized data access
- User data is isolated by authentication
- Call data is linked to authenticated users only

## Performance

- Database indexes optimize query performance
- Statistics are calculated on-demand
- Refresh button allows manual data updates
- Efficient queries minimize database load

## Future Enhancements

Potential improvements:

- Real-time updates using Supabase subscriptions
- Export functionality for reports
- Advanced filtering and search
- Call duration analytics
- Geographic call distribution
- Time-based analytics (daily, weekly, monthly)
