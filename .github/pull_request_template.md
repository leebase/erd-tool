## Summary

Describe the user-visible outcome and why it is needed.

## Scope

- [ ] This change is focused on one user problem or provider slice
- [ ] Unsupported behavior and follow-up work are documented
- [ ] The canonical physical model remains the source of truth

## Validation

- [ ] Python tests pass (`pytest`)
- [ ] Desktop release gate passes (`cd desktop && npm run verify:release`)
- [ ] Relevant desktop tests, lint, and builds pass
- [ ] Provider fixtures are synthetic or sanitized and include no secrets
- [ ] No credentials, generated installers, or local profiles are included
- [ ] Documentation and changelog are updated when behavior changes
- [ ] Code is placed under the correct MIT or AGPL license boundary

## Provider details

Complete this section for database/provider changes. Record the provider,
cloud/runtime version, metadata/API surface, supported objects and types,
privileges, and explicit exclusions. Link the relevant issue and official
provider documentation.

## Screenshots

Include screenshots for visual changes, or write “Not applicable.”
