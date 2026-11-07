/**
 * A country you've been to that Swarm doesn't know about: from a list you pasted in
 * (e.g. from another travel app) or added by hand. id = ISO alpha-2 code, so a country is one record.
 */
export interface CountryVisit {
  id: string;
  /** Earliest known day (YYYY-MM-DD) if you know it. Never invented: a country with no date shows as "date unknown". */
  firstVisit?: string;
  source: 'list' | 'manual';
  createdAt: string;
  updatedAt: string;
}
