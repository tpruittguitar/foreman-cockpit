# Constraint rate window

The Pipeline dashboard's Rate average selector offers 36 hours (default), 24 hours, 12 hours and 6 hours. The selected window applies to all process rates and the constraint calculation. The browser remembers it locally across refreshes.

Rates count distinct completed job identities in the selected rolling elapsed window and divide by its hours. Counts are calculated by the existing observation publisher, not by rescaling the 36-hour average. Integer labels are display rounding; constraint selection compares the underlying unrounded rates among processes with waiting work. Current queues, daily totals and user decisions are independent of this selector.

Discovery and intake use `upstream.ratesByWindow`; enrichment uses `completionByWindow` in the same process-flow snapshot. Older snapshots support the default 36-hour view. Missing selected-window evidence displays zero with “no measurements” and cannot establish a constraint. Incomplete observation history remains labeled as an observed minimum. Daily totals and current queues do not imply historical output.
