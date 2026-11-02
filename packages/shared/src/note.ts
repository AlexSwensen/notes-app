/**
 * A page in the workspace, exactly as it is sent over the wire.
 * `Content` is the editor document; the server treats it as opaque JSON.
 */
export interface Note<Content = unknown> {
  id: string;
  /** `null` for top-level pages. */
  parentId: string | null;
  title: string;
  /** An emoji, or `''` for none. */
  icon: string;
  content: Content;
  /** Plain-text version of `content`, used for search. */
  text: string;
  favorite: boolean;
  /** Position among its siblings (lower comes first). */
  sort: number;
  /** In the trash, but can still be restored. */
  trashed: boolean;
  /** Permanently deleted. Kept as a tombstone so the deletion syncs to every device. */
  purged: boolean;
  createdAt: number;
  /** Used for last-writer-wins conflict resolution. */
  updatedAt: number;
}
