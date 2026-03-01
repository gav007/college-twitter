# Production Checklist (Reference, Non-Binding)

## IMPORTANT
This file is guidance only.
If this file conflicts with anything in `specs/`, follow `specs/`.

## Pre-Launch
- [ ] `pm2 status` clean
- [ ] `systemctl status nginx` clean
- [ ] HTTPS certificate valid
- [ ] HTTP redirects to HTTPS
- [ ] Backups configured
- [ ] Restore drill completed
- [ ] Rate limits active
- [ ] CSRF active on all write forms
- [ ] Secure cookie flags confirmed
- [ ] Security headers confirmed

## Launch Day
- [ ] Smoke register/login/post/follow/explore/like
- [ ] Check error logs (`pm2 logs`, nginx logs)
- [ ] Confirm DB write path and free disk space

## Post-Launch Weekly
- [ ] Review auth failure rates
- [ ] Review 4xx/5xx trends
- [ ] Verify latest backup files
- [ ] Verify certificate renewal state
