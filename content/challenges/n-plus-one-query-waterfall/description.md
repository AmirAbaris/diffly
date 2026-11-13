# N+1 Query Waterfall in Nested Relationship Serializer

## Description
A team management API provides an organization member directory endpoint. To serialize the roster, `serialize_organization_roster` queries the `OrgMember` association table and iterates over the returned records to look up each member's `UserProfile` and assigned `OrgRole`.

## Threat Model
Executing secondary database queries inside a loop over collection items creates the classic N+1 query problem. For an organization with 500 members, this method executes $1 + 2 \times 500 = 1,001$ sequential round-trip queries over the database connection. This overwhelms database connection pools, spikes database CPU utilization, and introduces multi-second response latencies for large enterprise teams.
