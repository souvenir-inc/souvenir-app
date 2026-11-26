// Researched benchmark bands for the demo metrics, for a general Shopify DTC store, with vertical bands where a
// source covers them. Every band names its sources and how sure we are: Known (we opened the source), Known
// (excerpt) (seen in a search excerpt or quoted by another site), Inferred (our reasoning from the sources; the
// thresholds in particular). Rates are fractions (0.04 is 4%), money is USD.
//
// Research: 12 Nov 2026, from public sources only, building on Scope 1's notes (scope/benchmarks.md). Caveats:
// November CPMs and discount rates run above these full-year bands; our MER divides by Meta spend only, so it reads
// higher than every benchmark; check whether our Meta clicks are all clicks or link clicks before trusting CTR,
// CPC and conversion verdicts. Clear reuse terms with publishers before general release (scope/benchmarks.md, D-B1).
// Generated from the research file's JSON; edit the research and regenerate rather than hand-editing numbers.

import type { Benchmark } from './benchmarks'

export const BENCHMARK_DATA: Benchmark[] = [
  {
    "metric": "aov",
    "direction": "higher",
    "band": {
      "healthy": {
        "low": 65
      },
      "redFlag": {
        "below": 40
      }
    },
    "verticals": {
      "apparel": {
        "healthy": {
          "low": 65
        }
      },
      "beauty": {
        "healthy": {
          "low": 55
        }
      },
      "home": {
        "healthy": {
          "low": 95
        }
      },
      "food_beverage": {
        "healthy": {
          "low": 60
        }
      },
      "health_wellness": {
        "healthy": {
          "low": 55
        }
      },
      "electronics": {
        "healthy": {
          "low": 110
        }
      }
    },
    "sources": [
      {
        "publisher": "Polar Analytics",
        "title": "Ecommerce benchmark",
        "url": "https://www.polaranalytics.com/benchmark",
        "date": "2026-08-25",
        "sample": "4,000+ Shopify brands; medians by industry; updated weekly",
        "evidence": "Known"
      },
      {
        "publisher": "Triple Whale",
        "title": "Ecommerce benchmarks",
        "url": "https://www.triplewhale.com/blog/ecommerce-benchmarks",
        "sample": "Platform data; industry AOV range $42.79-$130.91",
        "evidence": "Known (excerpt)"
      },
      {
        "publisher": "Shopify",
        "title": "Analytics fields (Help Center)",
        "url": "https://help.shopify.com/en/manual/reports-and-analytics/shopify-reports/report-types/analytics-fields",
        "date": "2026-11-12",
        "sample": "Definition: AOV = (gross sales - discounts) / orders",
        "evidence": "Known"
      },
      {
        "publisher": "Souvenir (own reasoning)",
        "title": "Healthy line at 80% of vertical median; red line near the median Meta CPA",
        "date": "2026-11-12",
        "evidence": "Inferred"
      }
    ],
    "match": "approximate",
    "matchNote": "Ours includes shipping and tax; Shopify's AOV (and probably Polar's) excludes them, so ours reads roughly 5-15% higher.",
    "confidence": "medium",
    "note": "Order value depends mostly on what you sell, so compare with your own history first; under about $40, paid ads rarely pay back on the first order."
  },
  {
    "metric": "refund_rate",
    "direction": "lower",
    "band": {
      "healthy": {
        "high": 0.08
      },
      "redFlag": {
        "above": 0.15
      }
    },
    "verticals": {
      "apparel": {
        "healthy": {
          "high": 0.2
        },
        "redFlag": {
          "above": 0.3
        }
      },
      "beauty": {
        "healthy": {
          "high": 0.07
        },
        "redFlag": {
          "above": 0.12
        }
      },
      "home": {
        "healthy": {
          "high": 0.1
        },
        "redFlag": {
          "above": 0.18
        }
      },
      "electronics": {
        "healthy": {
          "high": 0.1
        },
        "redFlag": {
          "above": 0.18
        }
      }
    },
    "sources": [
      {
        "publisher": "Eightx (Matt Putra)",
        "title": "Average ecommerce refund rate by vertical 2026",
        "url": "https://eightx.co/blog/average-ecommerce-refund-rate-by-vertical-2026",
        "date": "2026-05-29",
        "sample": "An Eightx 2026 estimate, not a measured figure: return rates (NRF 2025) × cash-refund share (Loop 2025, Narvar 2024), as orders with a cash refund ÷ orders shipped",
        "evidence": "Known"
      },
      {
        "publisher": "Eightx",
        "title": "The gross-to-net revenue gap: benchmarks by category",
        "url": "https://eightx.co/blog/gross-to-net-revenue-gap-benchmarks-returns-plus-discounts",
        "date": "2026-06-30",
        "sample": "Returns as share of gross value; 10-Ks, Loop (4,000+ Shopify merchants, 14% adjusted), NRF (19.3% online), Finaloop",
        "evidence": "Known"
      },
      {
        "publisher": "Metorik",
        "title": "Ecommerce refund rate benchmarks",
        "url": "https://metorik.com/blog/ecommerce-refund-rate-benchmarks",
        "date": "2026-07-28",
        "sample": "6,000+ WooCommerce stores, 65M+ orders, 2025, average; 1.4% of orders (clothing 6.5%)",
        "evidence": "Known"
      },
      {
        "publisher": "Souvenir (own reasoning)",
        "title": "Return rates converted to a value-based refund rate",
        "date": "2026-11-12",
        "evidence": "Inferred"
      }
    ],
    "match": "approximate",
    "matchNote": "No source measures money refunded / revenue; these are per-order or return rates, and exchanges or store credit make refunds lower than returns.",
    "confidence": "low",
    "note": "Most non-clothing stores refund under about 8% of revenue; clothing runs far higher because of sizing returns."
  },
  {
    "metric": "discount_rate",
    "direction": "lower",
    "band": {
      "healthy": {
        "high": 0.1
      },
      "redFlag": {
        "above": 0.15
      }
    },
    "verticals": {
      "apparel": {
        "healthy": {
          "high": 0.12
        },
        "redFlag": {
          "above": 0.15
        }
      },
      "beauty": {
        "healthy": {
          "high": 0.08
        },
        "redFlag": {
          "above": 0.15
        }
      },
      "home": {
        "healthy": {
          "high": 0.08
        },
        "redFlag": {
          "above": 0.15
        }
      },
      "health_wellness": {
        "healthy": {
          "high": 0.1
        },
        "redFlag": {
          "above": 0.15
        }
      },
      "electronics": {
        "healthy": {
          "high": 0.09
        },
        "redFlag": {
          "above": 0.15
        }
      }
    },
    "sources": [
      {
        "publisher": "Eightx (Matt Putra)",
        "title": "Average discount and promo depth by vertical",
        "url": "https://eightx.co/blog/average-discount-promo-depth-by-vertical",
        "date": "2026-06-28",
        "sample": "Framework: under 5% disciplined, 5–10% the norm, 10–15% caution, over 15% promo-dependent; calibrated on a Particl / Triple Whale health and beauty panel (6.8% average)",
        "evidence": "Known"
      },
      {
        "publisher": "Eightx",
        "title": "The gross-to-net revenue gap: benchmarks by category",
        "url": "https://eightx.co/blog/gross-to-net-revenue-gap-benchmarks-returns-plus-discounts",
        "date": "2026-06-30",
        "sample": "Discount share of gross by vertical, estimates",
        "evidence": "Known"
      }
    ],
    "match": "exact",
    "matchNote": "Eightx uses the same formula: total discount dollars / gross sales across all orders. Only beauty is measured; other verticals are estimates.",
    "confidence": "medium",
    "note": "Discounts above about 10% of sales mean promotions are becoming a habit, and above 15% they usually eat the margin; expect higher numbers in BFCM weeks."
  },
  {
    "metric": "cancellation_rate",
    "direction": "lower",
    "band": {
      "healthy": {
        "high": 0.025
      },
      "redFlag": {
        "above": 0.05
      }
    },
    "sources": [
      {
        "publisher": "Amazon Seller Central",
        "title": "Cancellation rate",
        "url": "https://sellercentral.amazon.com/help/hub/reference/external/200285210",
        "date": "current",
        "sample": "Marketplace policy: seller-cancelled orders / orders over 7 days, seller-fulfilled; keep under 2.5%",
        "evidence": "Known (excerpt)"
      },
      {
        "publisher": "Vortex IQ",
        "title": "Shopify cancellation rate KPI card",
        "url": "https://docs.vortexiq.ai/nerve-centre/kpi-cards/shopify/cancellation-rate",
        "sample": "No source given; DTC apparel ~1-2.5%, multi-channel ~2-4%, alert above 3%",
        "evidence": "Known"
      },
      {
        "publisher": "Souvenir (own reasoning)",
        "title": "Conservative band from a marketplace rule and vendor guidance; no measured DTC benchmark",
        "date": "2026-11-12",
        "evidence": "Inferred"
      }
    ],
    "match": "approximate",
    "matchNote": "Same formula as the vendor card; Amazon counts only seller-caused cancels, ours counts all cancels.",
    "confidence": "low",
    "note": "There is no solid public benchmark; a few percent of orders cancelled is normal, and over 5% is worth a look at fraud filters, stock levels or checkout."
  },
  {
    "metric": "ctr",
    "direction": "higher",
    "band": {
      "healthy": {
        "low": 0.015
      },
      "redFlag": {
        "below": 0.008
      }
    },
    "verticals": {
      "apparel": {
        "healthy": {
          "low": 0.015
        },
        "redFlag": {
          "below": 0.008
        }
      },
      "beauty": {
        "healthy": {
          "low": 0.016
        },
        "redFlag": {
          "below": 0.008
        }
      },
      "home": {
        "healthy": {
          "low": 0.015
        },
        "redFlag": {
          "below": 0.008
        }
      },
      "food_beverage": {
        "healthy": {
          "low": 0.013
        },
        "redFlag": {
          "below": 0.007
        }
      },
      "health_wellness": {
        "healthy": {
          "low": 0.018
        },
        "redFlag": {
          "below": 0.009
        }
      },
      "electronics": {
        "healthy": {
          "low": 0.015
        },
        "redFlag": {
          "below": 0.008
        }
      }
    },
    "sources": [
      {
        "publisher": "Triple Whale",
        "title": "Facebook ad benchmarks by industry",
        "url": "https://www.triplewhale.com/blog/facebook-ads-benchmarks",
        "date": "2026 (Aug 2025-Jul 2026 data)",
        "sample": "~35,000 ecommerce brands; median CTR 2.39%",
        "evidence": "Known (excerpt)"
      },
      {
        "publisher": "Whatagraph (citing Triple Whale)",
        "title": "100+ PPC benchmarks 2026",
        "url": "https://whatagraph.com/blog/articles/ppc-benchmarks",
        "date": "2026-10-22",
        "sample": "Triple Whale full-year 2025, ~35,000 brands; industry CTRs 1.85-2.70%",
        "evidence": "Known"
      },
      {
        "publisher": "WordStream by LocaliQ",
        "title": "Facebook ads benchmarks 2026",
        "url": "https://localiq.com/blog/facebook-advertising-benchmarks/",
        "date": "2026-09-23",
        "sample": "Traffic campaigns, 20 industries, averages; overall 1.93%",
        "evidence": "Known"
      },
      {
        "publisher": "Souvenir (own reasoning)",
        "title": "Thresholds set below both sources' central values",
        "date": "2026-11-12",
        "evidence": "Inferred"
      }
    ],
    "match": "approximate",
    "matchNote": "Sources don't say whether CTR counts all clicks or link clicks; if ours uses link clicks, these bands are too strict.",
    "confidence": "medium",
    "note": "Typical Meta ads get about 2 clicks per 100 views; under 1 in 100 usually means the creative isn't landing."
  },
  {
    "metric": "cpc",
    "direction": "lower",
    "band": {
      "healthy": {
        "high": 1.0
      },
      "redFlag": {
        "above": 2.0
      }
    },
    "verticals": {
      "apparel": {
        "healthy": {
          "high": 1.15
        },
        "redFlag": {
          "above": 2.25
        }
      },
      "beauty": {
        "healthy": {
          "high": 0.8
        },
        "redFlag": {
          "above": 1.6
        }
      },
      "home": {
        "healthy": {
          "high": 1.0
        },
        "redFlag": {
          "above": 2.0
        }
      },
      "food_beverage": {
        "healthy": {
          "high": 0.7
        },
        "redFlag": {
          "above": 1.45
        }
      },
      "health_wellness": {
        "healthy": {
          "high": 1.0
        },
        "redFlag": {
          "above": 2.0
        }
      }
    },
    "sources": [
      {
        "publisher": "WordStream by LocaliQ",
        "title": "Facebook ads benchmarks 2026",
        "url": "https://localiq.com/blog/facebook-advertising-benchmarks/",
        "date": "2026-09-23",
        "sample": "Traffic campaigns, averages; overall $0.60 (2025: $0.70)",
        "evidence": "Known"
      },
      {
        "publisher": "Whatagraph (citing WordStream 2025)",
        "title": "100+ PPC benchmarks 2026",
        "url": "https://whatagraph.com/blog/articles/ppc-benchmarks",
        "date": "2026-10-22",
        "sample": "US campaigns; $0.70 traffic, $1.92 lead",
        "evidence": "Known"
      },
      {
        "publisher": "Souvenir (own reasoning)",
        "title": "Triple Whale implied CPC = CPM / (1000 x CTR) = about $0.63; thresholds 1.6x and 3.2x",
        "date": "2026-11-12",
        "evidence": "Inferred"
      }
    ],
    "match": "approximate",
    "matchNote": "Benchmarks are traffic-objective campaigns across all advertisers, not ecommerce sales campaigns, which usually pay more per click.",
    "confidence": "low",
    "note": "Most stores pay well under $1 a click on Meta; over $2 a click usually means a narrow audience or tired creative."
  },
  {
    "metric": "cpm",
    "direction": "lower",
    "band": {
      "healthy": {
        "high": 20
      },
      "redFlag": {
        "above": 30
      }
    },
    "sources": [
      {
        "publisher": "Triple Whale",
        "title": "Facebook ad benchmarks by industry",
        "url": "https://www.triplewhale.com/blog/facebook-ads-benchmarks",
        "date": "2026 (Aug 2025-Jul 2026 data)",
        "sample": "~35,000 brands; CPM $15.06, +13% YoY",
        "evidence": "Known (excerpt)"
      },
      {
        "publisher": "Whatagraph (citing Triple Whale)",
        "title": "100+ PPC benchmarks 2026",
        "url": "https://whatagraph.com/blog/articles/ppc-benchmarks",
        "date": "2026-10-22",
        "sample": "Full-year 2025, ~35,000 brands; median CPM $14.19, +20% YoY",
        "evidence": "Known"
      },
      {
        "publisher": "Souvenir (own reasoning)",
        "title": "Thresholds about 1.35x and 2x the median",
        "date": "2026-11-12",
        "evidence": "Inferred"
      }
    ],
    "match": "exact",
    "matchNote": "Same formula: spend / impressions x 1000.",
    "confidence": "medium",
    "note": "Meta typically costs about $15 per 1,000 views; costs climb in November and December, so judge those weeks with care."
  },
  {
    "metric": "platform_roas",
    "direction": "higher",
    "band": {
      "healthy": {
        "low": 1.5
      },
      "redFlag": {
        "below": 1.0
      }
    },
    "verticals": {
      "apparel": {
        "healthy": {
          "low": 1.7
        },
        "redFlag": {
          "below": 1.0
        }
      },
      "beauty": {
        "healthy": {
          "low": 1.3
        },
        "redFlag": {
          "below": 1.0
        }
      },
      "home": {
        "healthy": {
          "low": 1.7
        },
        "redFlag": {
          "below": 1.0
        }
      },
      "food_beverage": {
        "healthy": {
          "low": 1.3
        },
        "redFlag": {
          "below": 1.0
        }
      },
      "health_wellness": {
        "healthy": {
          "low": 1.2
        },
        "redFlag": {
          "below": 1.0
        }
      },
      "electronics": {
        "healthy": {
          "low": 1.5
        },
        "redFlag": {
          "below": 1.0
        }
      }
    },
    "sources": [
      {
        "publisher": "Eightx (citing Triple Whale)",
        "title": "Average ecommerce ROAS by vertical 2026",
        "url": "https://eightx.co/blog/average-ecommerce-roas-by-vertical-2026",
        "date": "2026-05-29",
        "sample": "Triple Whale, ~35,000 brands, Jan-Dec 2025, medians; overall 1.93x",
        "evidence": "Known"
      },
      {
        "publisher": "Whatagraph (citing Triple Whale)",
        "title": "100+ PPC benchmarks 2026",
        "url": "https://whatagraph.com/blog/articles/ppc-benchmarks",
        "date": "2026-10-22",
        "sample": "Same panel; Meta-reported ROAS median 1.86",
        "evidence": "Known"
      },
      {
        "publisher": "Triple Whale",
        "title": "Facebook ad benchmarks by industry",
        "url": "https://www.triplewhale.com/blog/facebook-ads-benchmarks",
        "date": "2026",
        "sample": "Newer window; industry ROAS 1.44-2.25",
        "evidence": "Known (excerpt)"
      },
      {
        "publisher": "Souvenir (own reasoning)",
        "title": "Healthy at about 0.8x the vertical median; red where Meta claims less than spend",
        "date": "2026-11-12",
        "evidence": "Inferred"
      }
    ],
    "match": "approximate",
    "matchNote": "Both are Meta-reported purchase value / spend; the benchmark's attribution window isn't stated.",
    "confidence": "medium",
    "note": "The typical store sees Meta claim about $1.90 back per $1 spent; Meta's own numbers run 20-50% above real lift, and what counts as good depends on your margin."
  },
  {
    "metric": "platform_cpa",
    "direction": "lower",
    "band": {
      "healthy": {
        "high": 50
      },
      "redFlag": {
        "above": 80
      }
    },
    "verticals": {
      "apparel": {
        "healthy": {
          "high": 45
        },
        "redFlag": {
          "above": 75
        }
      },
      "beauty": {
        "healthy": {
          "high": 47
        },
        "redFlag": {
          "above": 75
        }
      },
      "home": {
        "healthy": {
          "high": 58
        },
        "redFlag": {
          "above": 95
        }
      },
      "food_beverage": {
        "healthy": {
          "high": 48
        },
        "redFlag": {
          "above": 75
        }
      },
      "health_wellness": {
        "healthy": {
          "high": 48
        },
        "redFlag": {
          "above": 75
        }
      },
      "electronics": {
        "healthy": {
          "high": 62
        },
        "redFlag": {
          "above": 100
        }
      }
    },
    "sources": [
      {
        "publisher": "Triple Whale",
        "title": "Facebook ad benchmarks by industry",
        "url": "https://www.triplewhale.com/blog/facebook-ads-benchmarks",
        "date": "2026 (Aug 2025-Jul 2026 data)",
        "sample": "~35,000 brands; CPA $38.99",
        "evidence": "Known (excerpt)"
      },
      {
        "publisher": "Whatagraph (citing Triple Whale)",
        "title": "100+ PPC benchmarks 2026",
        "url": "https://whatagraph.com/blog/articles/ppc-benchmarks",
        "date": "2026-10-22",
        "sample": "Full-year 2025; industry CPA $29.99–$49.48 (apparel $36.76, beauty $37.92, home $46.46)",
        "evidence": "Known"
      },
      {
        "publisher": "Souvenir (own reasoning)",
        "title": "Thresholds about 1.25-1.3x and 2x the median",
        "date": "2026-11-12",
        "evidence": "Inferred"
      }
    ],
    "match": "approximate",
    "matchNote": "Same idea (spend per Meta-claimed purchase), but the attribution window isn't stated.",
    "confidence": "low",
    "note": "Meta typically claims a sale for about $39 of spend; whether yours is fine depends on your order value and margin."
  },
  {
    "metric": "platform_conversion_rate",
    "direction": "higher",
    "band": {
      "healthy": {
        "low": 0.012
      },
      "redFlag": {
        "below": 0.006
      }
    },
    "verticals": {
      "apparel": {
        "healthy": {
          "low": 0.012
        },
        "redFlag": {
          "below": 0.006
        }
      },
      "beauty": {
        "healthy": {
          "low": 0.015
        },
        "redFlag": {
          "below": 0.008
        }
      },
      "home": {
        "healthy": {
          "low": 0.011
        },
        "redFlag": {
          "below": 0.005
        }
      },
      "food_beverage": {
        "healthy": {
          "low": 0.016
        },
        "redFlag": {
          "below": 0.008
        }
      },
      "health_wellness": {
        "healthy": {
          "low": 0.014
        },
        "redFlag": {
          "below": 0.007
        }
      },
      "electronics": {
        "healthy": {
          "low": 0.01
        },
        "redFlag": {
          "below": 0.005
        }
      }
    },
    "sources": [
      {
        "publisher": "Triple Whale",
        "title": "Facebook ad benchmarks by industry",
        "url": "https://www.triplewhale.com/blog/facebook-ads-benchmarks",
        "date": "2026 (Aug 2025-Jul 2026 data)",
        "sample": "~35,000 brands; CVR 1.53%",
        "evidence": "Known (excerpt)"
      },
      {
        "publisher": "Whatagraph (citing Triple Whale)",
        "title": "100+ PPC benchmarks 2026",
        "url": "https://whatagraph.com/blog/articles/ppc-benchmarks",
        "date": "2026-10-22",
        "sample": "Full-year 2025; industry CVR 1.20-2.02%",
        "evidence": "Known"
      },
      {
        "publisher": "Souvenir (own reasoning)",
        "title": "Thresholds about 0.8x and 0.4x the median; CPC / CVR cross-check matches Triple Whale's CPA",
        "date": "2026-11-12",
        "evidence": "Inferred"
      }
    ],
    "match": "approximate",
    "matchNote": "Triple Whale describes CVR as the share of ad clickers who convert but gives no exact formula; a CPC/CVR cross-check fits purchases / clicks.",
    "confidence": "low",
    "note": "Meta typically claims about 1.5 purchases per 100 clicks; well under 1 per 100 points to the landing page or offer, not the ad."
  },
  {
    "metric": "mer",
    "direction": "higher",
    "band": {
      "healthy": {
        "low": 3.0
      },
      "redFlag": {
        "below": 2.5
      }
    },
    "verticals": {
      "apparel": {
        "healthy": {
          "low": 4.0
        },
        "redFlag": {
          "below": 2.5
        }
      },
      "beauty": {
        "healthy": {
          "low": 3.6
        },
        "redFlag": {
          "below": 2.5
        }
      },
      "home": {
        "healthy": {
          "low": 5.0
        },
        "redFlag": {
          "below": 2.5
        }
      },
      "food_beverage": {
        "healthy": {
          "low": 5.9
        },
        "redFlag": {
          "below": 2.5
        }
      },
      "health_wellness": {
        "healthy": {
          "low": 3.3
        },
        "redFlag": {
          "below": 2.5
        }
      },
      "electronics": {
        "healthy": {
          "low": 4.0
        },
        "redFlag": {
          "below": 2.5
        }
      }
    },
    "sources": [
      {
        "publisher": "Eightx (Sam Dillon)",
        "title": "Ad spend as % of revenue by stage 2026",
        "url": "https://eightx.co/blog/ad-spend-percent-revenue-by-stage-2026",
        "date": "2026",
        "sample": "35+ brands in the US, Canada, UK and Australia: SEC filings, industry reports, platform data and Eightx client engagements ($5M–$50M)",
        "evidence": "Known"
      },
      {
        "publisher": "Eightx",
        "title": "Average ecommerce MER by vertical 2026",
        "url": "https://eightx.co/blog/average-ecommerce-mer-by-vertical-2026",
        "date": "2026-05-29",
        "sample": "9 public brands' FY25 10-Ks, $330M-$2.3B revenue; median 8.47",
        "evidence": "Known"
      },
      {
        "publisher": "Souvenir (own reasoning)",
        "title": "Vertical lines = 1 / top of Eightx's paid-share range for $5-25M brands",
        "date": "2026-11-12",
        "evidence": "Inferred"
      }
    ],
    "match": "mismatch",
    "matchNote": "Ours divides revenue (with shipping and tax) by Meta spend only; benchmarks divide net revenue by all paid media, so ours reads much higher.",
    "confidence": "medium",
    "note": "Most growing brands make $3-5 for every $1 of ads; under $2.50 for more than a couple of weeks usually means ads are losing money."
  },
  {
    "metric": "cpa",
    "direction": "lower",
    "band": {
      "healthy": {
        "high": 30
      },
      "redFlag": {
        "above": 40
      }
    },
    "verticals": {
      "apparel": {
        "healthy": {
          "high": 21
        },
        "redFlag": {
          "above": 33
        }
      },
      "beauty": {
        "healthy": {
          "high": 18
        },
        "redFlag": {
          "above": 26
        }
      },
      "home": {
        "healthy": {
          "high": 24
        },
        "redFlag": {
          "above": 48
        }
      },
      "food_beverage": {
        "healthy": {
          "high": 13
        },
        "redFlag": {
          "above": 31
        }
      },
      "health_wellness": {
        "healthy": {
          "high": 20
        },
        "redFlag": {
          "above": 26
        }
      },
      "electronics": {
        "healthy": {
          "high": 34
        },
        "redFlag": {
          "above": 54
        }
      }
    },
    "sources": [
      {
        "publisher": "Polar Analytics",
        "title": "Ecommerce benchmark",
        "url": "https://www.polaranalytics.com/benchmark",
        "date": "2026-08-25",
        "sample": "4,000+ Shopify brands, median AOV by industry (input to the derivation)",
        "evidence": "Known"
      },
      {
        "publisher": "Eightx (Sam Dillon)",
        "title": "Ad spend as % of revenue by stage 2026",
        "url": "https://eightx.co/blog/ad-spend-percent-revenue-by-stage-2026",
        "date": "2026",
        "sample": "35+ brands in the US, Canada, UK and Australia: SEC filings, industry reports, platform data and Eightx client engagements ($5M–$50M)",
        "evidence": "Known"
      },
      {
        "publisher": "Souvenir (own reasoning)",
        "title": "Derived: blended CPA = AOV / MER; no public source measures ad spend per order",
        "date": "2026-11-12",
        "evidence": "Inferred"
      }
    ],
    "match": "approximate",
    "matchNote": "Band is derived, not measured; public CAC benchmarks count new customers only, so they're a mismatch and aren't used.",
    "confidence": "low",
    "note": "A rough guide: ad spend per order should stay under a third of your order value; your own order value / 2.5 is a better red line than this generic number."
  },
  {
    "metric": "ad_spend_share",
    "direction": "lower",
    "band": {
      "healthy": {
        "high": 0.33
      },
      "redFlag": {
        "above": 0.4
      }
    },
    "verticals": {
      "apparel": {
        "healthy": {
          "high": 0.25
        },
        "redFlag": {
          "above": 0.4
        }
      },
      "beauty": {
        "healthy": {
          "high": 0.28
        },
        "redFlag": {
          "above": 0.4
        }
      },
      "home": {
        "healthy": {
          "high": 0.2
        },
        "redFlag": {
          "above": 0.4
        }
      },
      "food_beverage": {
        "healthy": {
          "high": 0.17
        },
        "redFlag": {
          "above": 0.4
        }
      },
      "health_wellness": {
        "healthy": {
          "high": 0.3
        },
        "redFlag": {
          "above": 0.4
        }
      },
      "electronics": {
        "healthy": {
          "high": 0.25
        },
        "redFlag": {
          "above": 0.4
        }
      }
    },
    "sources": [
      {
        "publisher": "Eightx (Sam Dillon)",
        "title": "Ad spend as % of revenue by stage 2026",
        "url": "https://eightx.co/blog/ad-spend-percent-revenue-by-stage-2026",
        "date": "2026",
        "sample": "35+ brands in the US, Canada, UK and Australia: SEC filings, industry reports, platform data and Eightx client engagements ($5M–$50M)",
        "evidence": "Known"
      },
      {
        "publisher": "Souvenir (own reasoning)",
        "title": "Default mirrors MER 3.0 / 2.5; 40% is Eightx's survival line for brands under $1M",
        "date": "2026-11-12",
        "evidence": "Inferred"
      }
    ],
    "match": "mismatch",
    "matchNote": "Ours counts Meta spend only against revenue with shipping and tax; benchmarks count all paid media against net revenue, so ours reads lower.",
    "confidence": "medium",
    "note": "Smaller brands often spend 20-30% of revenue on ads; above 40% usually isn't sustainable unless margins are very high."
  }
]
