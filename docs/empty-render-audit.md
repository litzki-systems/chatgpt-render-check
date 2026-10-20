# Empty Render Audit

## Scope

This audit covers the 33 domains in Tranco snapshot `74V6X` that returned HTTP success during benchmark run `34161247425`, while the reconstructed renderer produced zero words.

The benchmark artifact alone cannot identify the technical cause. Page-level observations were therefore used only as supporting diagnostics. They are not treated as equivalent to the benchmark fetch environment.

## Findings

Several empty cases have independently observable characteristics consistent with an application shell, JavaScript dependency, bot protection, redirect/login state, or a representation with little extractable text.

Examples:

| Domain | Diagnostic observation | Working classification |
| --- | --- | --- |
| `mail.ru` | Redirects to an account/login flow | Login or redirect state |
| `espn.com` | Returns a JavaScript-dependent robot verification page | Bot defense / JS dependency |
| `tiktok.com` | Retrieval denied to the diagnostic crawler | Access control / bot defense |
| `msn.com` | Retrieval denied to the diagnostic crawler | Access control / bot defense |
| `threads.com` | Returns HTTP 429 to the diagnostic crawler | Rate limiting |
| `jetbrains.com` | Diagnostic representation exposes an iframe with no substantive page text | Application or embedded content shell |
| `arcgis.com` | Redirects to `www.arcgis.com/index.html` with no extracted text in the diagnostic representation | Application shell / extraction sensitivity |
| `ryanair.com` | Redirects to a localized application route with no extracted text in the diagnostic representation | Application shell / extraction sensitivity |
| `roblox.com` | Redirects to `www.roblox.com` with no extracted text in the diagnostic representation | Application shell / extraction sensitivity |
| `twitch.tv` | Successful HTML representation produced no extracted text in the benchmark | Undetermined; application-heavy page |
| `weibo.com` | Diagnostic representation contains substantive text and links | Renderer-specific discrepancy requires investigation |
| `dailymotion.com` | Diagnostic representation contains substantial text | Renderer-specific discrepancy requires investigation |
| `jd.com` | Diagnostic representation contains substantive Chinese text and links | Renderer-specific discrepancy requires investigation |

The last group is important. A page can expose extractable text to an external diagnostic representation while producing zero words in the benchmark. That means the empty-render cohort cannot be classified solely as JavaScript applications or bot protection.

## Classification rule

The 33 empty renders remain a separate cohort. No domain is promoted into the usable renderer baseline based on inference alone.

The current classification states are:

1. `login_or_redirect`
2. `bot_defense_or_rate_limit`
3. `application_or_embedded_shell`
4. `renderer_specific_discrepancy`
5. `undetermined`

These labels describe diagnostic hypotheses. They do not establish why the benchmark renderer returned zero words.

## Methodological consequence

The empty-render cohort is excluded from renderer statistics. It remains visible in benchmark quality reporting because its distribution may itself be informative about the limitations of external HTML retrieval.

The next implementation should capture the raw response characteristics needed to distinguish these cases reproducibly: final URL, HTTP status, content type, response byte length, HTML byte length, post-cleanup byte length, and rendered character count.

## Evidence boundary

The benchmark measures a deterministic reconstruction of an observed rendering path. External page diagnostics can validate or challenge a hypothesis about an empty result, but they do not reveal the exact response received by the benchmark runner at the time of the original run.
