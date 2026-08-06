# AI Migration Source: Legacy Project `aracze-grails`

## Purpose

This document is a compact, high-signal source for AI and developers migrating this legacy app to a new system.

Goals:

- avoid repeated full-project scanning,
- preserve domain knowledge and conventions,
- speed up onboarding and implementation decisions,
- keep URL and business behavior compatibility where needed.

This file should be updated whenever major migration discoveries are made.

---

## 1) System Snapshot

- Type: legacy monolithic CMS/travel portal.
- Framework: Grails 3.2.x (Spring Boot + GORM/Hibernate).
- Java: JDK 8 era.
- Build: Gradle (`gradlew`), WAR packaging.
- Rendering: server-side GSP + TagLib + jQuery-heavy frontend.
- Database: MySQL.
- Runtime storage: local filesystem under `cms/` for images, avatars, dumps, pdf guides.
- Deployment history: Tomcat and WAR-based deployment, GitLab CI/CD.

Core project directories:

- `grails-app/controllers` HTTP orchestration.
- `grails-app/services` business logic and integrations.
- `grails-app/domain` data model and domain rules.
- `grails-app/views` GSP templates.
- `grails-app/taglib` presentation helpers and dynamic fragments.
- `grails-app/assets` CSS/JS/image assets.
- `grails-app/jobs` Quartz background jobs.
- `grails-app/conf` environment/app/security/runtime configuration.
- `src/migrations/db` SQL migrations.

---

## 2) High-Level Architecture

Request flow:

1. URL mappings route request to controller.
2. Controller validates context and delegates to services.
3. Services query/manipulate GORM domain entities and external APIs.
4. Views/TagLib render HTML fragments and pages.
5. Frontend JS enhances behavior (AJAX, widgets, dynamic content).

Important technical characteristics:

- strong coupling between service logic and rendering concerns,
- rich domain model but with legacy conventions,
- mixed use of dynamic finders, HQL, and raw SQL,
- background jobs handle weather, caches, updates, cleanup.

---

## 3) Domain Model (Migration-Critical)

Most important aggregate roots/entities:

### Page (central content node)

- hierarchical tree (`parent` / `childPageList`),
- relation to `Article`, `PageSection`, practical info and affiliate settings,
- URL behavior and publication state (draft/publish) are business-critical.

### Article

- belongs to user/content context,
- linked to pages,
- URL compatibility via URL mapping entities.

### UrlToArticle

- canonical and alternative URL mapping for articles,
- very important for SEO-preserving migration.

### User + UserProfile

- security identity and profile data,
- role-based authorization via `Role`, `UserRole`, `Requestmap`.

### Comment ecosystem

- comments and ratings link to pages/articles via local + plugin concepts,
- appears in homepage/activity/profile metrics.

### Weather and Affiliates

- domain models for weather forecasts and affiliate links/settings,
- backed by jobs and external providers.

### Feather economy context

- `Account`, `Transaction`, `TransactionDraft` and enums,
- should migrate as separate bounded context.

---

## 4) Routing and UI Flows

Key behavior to preserve:

### Friendly URL resolution

- dynamic path resolution maps slugs to page/article entities,
- catch-all URL behavior and redirects strongly impact SEO.

### Home

- aggregates newest/featured content and activity,
- supports AJAX partial reloads/load-more behavior.

### Page/Article detail

- page and article detail views combine content, comments, related items,
- publication state and canonical URL handling are key.

### Profile area

- profile display/edit, avatar upload, password change, user stats.

### Images

- media loading endpoint family (`loadImage`, `loadPreview`, etc.),
- avatar loading by both user ID and username-based lookup.

### Auth

- Spring Security with Czech localized auth routes and request map ACL style.

---

## 5) Avatar Behavior (Important Legacy Detail)

Legacy behavior that can be confusing:

- UI often renders avatar URL as `/image/loadAvatar/{userId}`.
- Controller resolves user by ID.
- Actual avatar file path is computed from username (`{username}.jpg`) in avatar directory.

Implication:

- request key and storage key are different,
- username changes can break avatar lookup unless file naming is migrated carefully.

Migration recommendation:

- in target system, use immutable media IDs (or object storage keys),
- keep compatibility endpoint during transition.

---

## 6) Frontend Style and Conventions

Current frontend style:

- large monolithic stylesheet (`kickstart.css`) + responsive override file,
- mixed naming style: utility/bootstrap-like + BEM-like components,
- jQuery-centered JavaScript with page-specific modules,
- GSP partial-driven rendering and repeated template fragments.

Migration guidance:

- keep visual semantics first (layout hierarchy, information architecture),
- avoid direct 1:1 CSS copy as long-term strategy,
- re-model components (header, nav, content cards, activity streams, profile blocks),
- preserve user-visible behavior (fallback avatars, list ordering, date formatting).

---

## 7) Configuration and Runtime Conventions

Configuration center:

- `grails-app/conf/application.groovy` (environments, datasource, security, APIs, cache, limits).

Runtime conventions:

- app creates/uses local folders under `cms/` in project/runtime dir,
- image/avatars/pdf/dump paths are configuration-driven but local-filesystem based.

Security warning:

- legacy repository includes hardcoded credentials/secrets in configuration and docs.
- treat as compromised; rotate and move to secret manager before any new deployment.

---

## 8) Integrations and Background Jobs

External integrations present in legacy:

- Google maps/geocode,
- weather providers,
- Cloudinary for image handling,
- email SMTP,
- analytics-related integrations,
- affiliate providers.

Background processing (Quartz jobs):

- weather/forecast updates,
- exchange or external data refresh,
- cache eviction and cleanup tasks,
- user/account related periodic maintenance.

Migration recommendation:

- move jobs to explicit worker system (queue/scheduler) with observability.

---

## 9) Operational Notes

- SQL migrations exist in `src/migrations/db` and historical scripts in `src/migrations/db/done`.
- Legacy process relies on DB dump/import scripts and filesystem backups.
- CI/CD currently oriented around WAR build and SSH/SCP deployment.

Migration recommendation:

- introduce repeatable schema migrations in target stack,
- separate application data from deploy artifact,
- create deterministic backup/restore runbooks.

---

## 10) Risks and Technical Debt

Top risks:

- hardcoded secrets in repository,
- outdated framework/dependency stack,
- tightly coupled monolith (controller/service/view/taglib),
- mixed query styles and potential performance hotspots,
- shell-based DB operations in app code,
- large upload limits and legacy assumptions,
- runtime behavior hidden in dynamic Groovy patterns.

Migration impact:

- exact behavior parity may require temporary compatibility layer,
- direct rewrite without URL/content compatibility can hurt SEO and UX.

---

## 11) Suggested Target Mapping (Legacy -> New)

- URL + content resolution: preserve as first-class module (SEO compatibility).
- Domain split:
  - Content: Page/Article/sections/URLs,
  - Identity: User/Profile/Auth,
  - Engagement: comments/ratings/activity,
  - Media: images/avatars,
  - Rewards: feather accounts/transactions,
  - Integrations: weather/maps/affiliate/email.
- Replace request-map ACL with modern policy/auth solution.
- Replace filesystem media assumptions with object storage and immutable IDs.
- Keep legacy endpoint compatibility where externally linked.

---

## 12) Migration Sequence (Practical)

1. Inventory and freeze critical URL behavior and DB schema baseline.
2. Build read-only compatibility paths first (home/page/article/profile/media).
3. Migrate media and URL mapping with redirects/canonical parity.
4. Migrate auth + profile + comments flows.
5. Move background jobs/integrations behind adapters.
6. Migrate write/admin capabilities.
7. Decommission legacy modules incrementally.

---

## 13) AI Working Rules for This Repository

When an AI agent works on migration tasks, follow these principles:

- read this file first,
- preserve user-visible behavior before internal refactor,
- treat SEO URL behavior as non-negotiable until explicitly changed,
- avoid introducing secrets into repository,
- annotate assumptions when code is ambiguous,
- document every discovered legacy edge case back into this file.

Checklist before implementing migration changes:

- Is URL behavior preserved?
- Is canonical URL behavior preserved?
- Are profile/avatar semantics preserved or intentionally changed with migration plan?
- Are background side effects (jobs/integrations) accounted for?
- Are security credentials externalized?

---

## 14) Key Files to Read First

- `README.md`
- `build.gradle`
- `grails-app/conf/application.groovy`
- `grails-app/controllers/aracze/UrlMappings.groovy`
- `grails-app/controllers/kony/cms/FriendlyUrlController.groovy`
- `grails-app/controllers/kony/cms/PageController.groovy`
- `grails-app/controllers/kony/cms/ArticleController.groovy`
- `grails-app/controllers/kony/cms/ImageController.groovy`
- `grails-app/services/kony/cms/PageService.groovy`
- `grails-app/services/kony/cms/ArticleService.groovy`
- `grails-app/services/kony/cms/CommentService.groovy`
- `grails-app/domain/kony/cms/Page.groovy`
- `grails-app/domain/kony/cms/Article.groovy`
- `grails-app/domain/kony/cms/UrlToArticle.groovy`
- `grails-app/domain/kony/cms/User.groovy`
- `grails-app/views/layouts/kickstart.gsp`
- `grails-app/assets/stylesheets/kickstart.css`
- `src/migrations/db`

---

## 15) Maintenance of This Document

Update this document when:

- new legacy behavior is discovered,
- migration decisions are finalized,
- compatibility assumptions change,
- additional high-risk hotspots are identified.

Recommended versioning note format:

- Date
- What changed in understanding
- Impact on migration plan
