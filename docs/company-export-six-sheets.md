# Six-sheet customer export

The normal export now produces a local XLSX with 客户、联系人、线索、商机、跟进、报价, including empty headers when a category has no rows. Each business record occupies one row. Chinese headers, filtered frozen headers, readable dates and statuses, preserved telephone text and numeric business amounts make it usable in Excel/WPS. IDs and tracking remain at the end and hidden by default.

Company and staff display names are resolved when the approved server snapshot is created, not after approval or during download. Original fixed fields and IDs remain in the snapshot and workbook; ownership may contain several people for a company, and absent names stay blank. No email or extra contact fields are fetched for staff. Existing date/category filtering, exact personal grants, approval, risk checks, one-time claims and audit remain unchanged. Old consumed snapshots remain immutable.

Workbook serialization is local with no third-party library/network, inline text cells (no formulas), styles and ZIP/OOXML. Invalid/duplicate CSV fields and Excel cell length limits fail explicitly rather than truncating data. The server CSV safety escape remains preserved. Empty categories retain a sheet.
