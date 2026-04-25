// Default templates seeded into newly created documents. They reference
// merge fields so authors immediately see the conventions and don't have to
// look up the syntax to add common variables.

export function getSopStarterTemplate(): string {
  return `# {{employee_name}} — Standard Operating Procedure

This SOP outlines the responsibilities for **{{employee_name}}** ({{employee_departments}}) at **{{org_name}}**.

## Overview

_Add a short summary of what this SOP covers._

## Daily tasks

-

## Notes

_Anything else worth documenting._
`
}
