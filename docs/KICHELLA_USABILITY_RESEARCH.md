# Kichella usability research

Research applied during the November 4-5, 2026 stabilization. These are
published design principles, not interviews or a study of Pennywise users.

| Primary source                                            | Application                                                                                                      | Boundary                                                                  |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Nielsen Norman Group, Ten Usability Heuristics            | Visible save status; error recovery without re-entry; grouped navigation                                         | Heuristic evaluation is not usability-test evidence                       |
| Nielsen Norman Group, Progressive Disclosure              | Essential transaction fields first; optional details retained and automatically revealed for linked transactions | Advanced financial workflows remain available                             |
| GOV.UK Design System, Error Summary                       | Focus the summary; link it to matching field errors; preserve entered values                                     | Browser keyboard cases cover selected paths, not all assistive technology |
| GOV.UK Design System, Question Pages                      | Necessary questions first, contextual help and explicitly optional information                                   | Existing financial schema and form submissions remain unchanged           |
| W3C WCAG 2.2, Target Size and Focus Not Obscured guidance | Mobile target sizing, sticky actions, skip link and field associations                                           | Not a WCAG conformance claim; no full contrast/screen-reader audit        |
| CFPB Your Money, Your Goals toolkit                       | Separate actual cash/income tracking from planning; present tools by immediate purpose                           | No US credit/legal assumptions applied to Kenyan finances                 |
| React reference, memo                                     | Avoid recalculating the active page for unrelated shell state                                                    | Performance optimization cannot replace correct state updates             |
| W3C Indexed Database API specification                    | Atomic transactions and commit/abort-driven save status                                                          | UI deadlines do not authorize a false failure after commit                |

Sources:

- https://www.nngroup.com/articles/ten-usability-heuristics/
- https://www.nngroup.com/articles/progressive-disclosure/
- https://design-system.service.gov.uk/components/error-summary/
- https://design-system.service.gov.uk/patterns/question-pages/
- https://www.w3.org/TR/WCAG22/
- https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html
- https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html
- https://www.consumerfinance.gov/consumer-tools/educator-tool/your-money-your-goals/toolkit/
- https://react.dev/reference/react/memo
- https://www.w3.org/TR/IndexedDB-3/

WCAG 2.2 AA target-size guidance uses 24 CSS pixels with exceptions, not a
universal 44-pixel requirement. Larger mobile controls are a practical design
choice. No readable Material Design or MoneyHelper source was obtained during
the audit; neither is claimed as reviewed research.
