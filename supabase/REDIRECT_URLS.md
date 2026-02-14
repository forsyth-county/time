# Supabase Auth Redirect URLs Configuration

## Required Redirect URLs

In your Supabase project dashboard, go to **Authentication** > **URL Configuration** and add these redirect URLs:

### Local Development
```
http://localhost:3000/time
http://localhost:3000/time/
```

### Production
Replace `yourdomain.com` with your actual domain:
```
https://yourdomain.com/time
https://yourdomain.com/time/
```

### Wildcard (if using multiple subdomains)
```
https://*.yourdomain.com/time
https://*.yourdomain.com/time/
```

### Common Deployment Platforms

#### Vercel
```
https://your-project.vercel.app/time
https://your-project.vercel.app/time/
https://*.vercel.app/time
```

#### Netlify
```
https://your-project.netlify.app/time
https://your-project.netlify.app/time/
https://*.netlify.app/time
```

#### GitHub Pages
```
https://yourusername.github.io/time
https://yourusername.github.io/time/
```

## Site URL Configuration

Also set the **Site URL** in Supabase Authentication settings:

### Local Development
```
http://localhost:3000/time
```

### Production
```
https://yourdomain.com/time
```

## Important Notes

1. **BasePath**: This app uses `/time` as the base path (configured in `next.config.ts`)
2. **Trailing Slash**: Both with and without trailing slashes should work
3. **HTTPS Required**: Production URLs must use HTTPS (except localhost)
4. **Wildcards**: Use `*` for subdomain wildcards, e.g., `https://*.vercel.app/time`

## Testing

After adding the redirect URLs:
1. Clear your browser cache and localStorage
2. Try signing up with a new account
3. Check that you're redirected back to the app after email confirmation
4. Verify login works correctly

## Troubleshooting

If you get "redirect URL not allowed" errors:
- Double-check the URLs in Supabase dashboard
- Ensure you included both with and without trailing slash
- Make sure the base path `/time` is included
- Check that the protocol (http/https) matches
- For localhost, use `http://`, for production use `https://`
