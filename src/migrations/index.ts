import * as migration_20260411_rename_full_url_to_full_slug from './20260411_rename_full_url_to_full_slug'

export const migrations = [
  {
    up: migration_20260411_rename_full_url_to_full_slug.up,
    down: migration_20260411_rename_full_url_to_full_slug.down,
    name: '20260411_rename_full_url_to_full_slug',
  },
]
