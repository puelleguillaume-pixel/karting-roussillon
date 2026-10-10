# Résultats du dernier build (094e31e)

| Étape | Résultat |
|---|---|
| TypeScript | success |
| ESLint | success |
| Tests unitaires | success |
| Build de production | success |

## typecheck

```

> karting-torreilles@0.1.0 typecheck
> tsc -b

```

## lint

```

> karting-torreilles@0.1.0 lint
> eslint .

```

## unit

```

> karting-torreilles@0.1.0 test
> vitest run


[1m[30m[46m RUN [49m[39m[22m [36mv5.0.2 [39m[90m/home/runner/work/karting-roussillon/karting-roussillon[39m

 [32m✓[39m src/test/seo.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m src/test/rules.test.ts [2m([22m[2m15 tests[22m[2m)[22m[32m 9[2mms[22m[39m

[2m Test Files [22m [1m[32m2 passed[39m[22m[90m (2)[39m
[2m      Tests [22m [1m[32m21 passed[39m[22m[90m (21)[39m
[2m   Start at [22m 17:17:59
[2m   Duration [22m 215ms[2m (transform 68%, import 22%, tests 8%, worker 3%)[22m

```

## build

```
dist-ssr/assets/visuals-HedkZglH.js               7.37 kB │ gzip:  2.48 kB
dist-ssr/assets/pdf-Dk8HaLok.js                   7.51 kB │ gzip:  2.92 kB
dist-ssr/assets/CircuitsPage-afHK6dNM.js          7.62 kB │ gzip:  2.34 kB
dist-ssr/assets/labels-B4boFpRq.js                8.47 kB │ gzip:  3.27 kB
dist-ssr/assets/SlotPicker--iyInp1I.js            8.61 kB │ gzip:  2.65 kB
dist-ssr/assets/ManualBookingDialog-CeNrEye7.js   9.14 kB │ gzip:  3.08 kB
dist-ssr/assets/HomePage-CTyUnLnM.js              9.79 kB │ gzip:  2.79 kB
dist-ssr/assets/blocks-DVGcnPfb.js               10.09 kB │ gzip:  3.17 kB
dist-ssr/assets/RequestForm-mRsIuc8F.js          10.54 kB │ gzip:  3.25 kB
dist-ssr/assets/BookingsPage-D2II5cdk.js         10.98 kB │ gzip:  3.26 kB
dist-ssr/assets/CheckInPage-CEOd7BL-.js          11.06 kB │ gzip:  3.96 kB
dist-ssr/assets/cards-BCmaDXIA.js                11.72 kB │ gzip:  3.04 kB
dist-ssr/assets/ChronosPage-D38Qv2Lf.js          11.85 kB │ gzip:  3.82 kB
dist-ssr/assets/AccountPage-DvnWkH6z.js          13.01 kB │ gzip:  3.96 kB
dist-ssr/assets/ExportsPage-hfj8T4oq.js          13.51 kB │ gzip:  3.33 kB
dist-ssr/assets/AdminLayout-C-YX68Hb.js          14.15 kB │ gzip:  4.15 kB
dist-ssr/assets/BlocksPage-s_g4rt3B.js           14.29 kB │ gzip:  4.19 kB
dist-ssr/assets/RequestsPage-1RZfX3na.js         14.39 kB │ gzip:  4.41 kB
dist-ssr/assets/EventBookingPage-BdEAnGC7.js     15.03 kB │ gzip:  4.49 kB
dist-ssr/assets/SettingsPage-DV8Ukh-O.js         16.17 kB │ gzip:  4.85 kB
dist-ssr/assets/EventsPage-BlgPxMeY.js           17.97 kB │ gzip:  5.23 kB
dist-ssr/assets/DashboardPage-BcjliIOa.js        18.26 kB │ gzip:  5.21 kB
dist-ssr/assets/CustomersPage-B0uVll5c.js        19.82 kB │ gzip:  4.98 kB
dist-ssr/assets/ParticipantFields-BE3ZyjVj.js    20.14 kB │ gzip:  6.15 kB
dist-ssr/assets/BlockDialog-bYs7xVkf.js          21.19 kB │ gzip:  5.98 kB
dist-ssr/assets/ManageBookingPage-CfeTZpAP.js    21.30 kB │ gzip:  6.33 kB
dist-ssr/assets/GiftCardsPage-CsUKhDaT.js        21.96 kB │ gzip:  6.05 kB
dist-ssr/assets/BookingDetails-CT34l72K.js       22.41 kB │ gzip:  5.95 kB
dist-ssr/assets/ContentPage-DntynL0j.js          22.44 kB │ gzip:  5.71 kB
dist-ssr/assets/AvailabilityPage-DfJvUyxw.js     23.53 kB │ gzip:  5.95 kB
dist-ssr/assets/render-R8eqPPBA.js               24.20 kB │ gzip:  6.97 kB
dist-ssr/assets/PlanningPage-DCbkN86b.js         26.17 kB │ gzip:  7.16 kB
dist-ssr/assets/CatalogPage-DYIJqJ_e.js          26.76 kB │ gzip:  5.56 kB
dist-ssr/assets/ui-Csxu-tmT.js                   30.41 kB │ gzip:  7.55 kB
dist-ssr/assets/GiftCardPage-Bczi9VZ8.js         32.13 kB │ gzip:  8.28 kB
dist-ssr/assets/BookingPage-DU6xP-CJ.js          35.45 kB │ gzip:  8.80 kB
dist-ssr/entry-server.js                         69.59 kB │ gzip: 17.91 kB

[32m✓ built in 88ms[39m
Pré-rendu SEO : 16 pages (données embarquées : 16 Ko), sitemap et robots.txt (données de démonstration, indexation bloquée) en 3458 ms
```
