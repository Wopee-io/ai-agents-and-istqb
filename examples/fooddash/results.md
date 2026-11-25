# Test run results

Tests: `tests.json` (23 generated, 22 runnable, 1 blocked by a question).

## battle (http://localhost:4174)

Run 22, passed 9, failed 13 (HH-02, HH-03, HH-05, HH-06, HH-07, PK-01, PS-01, PS-04, PS-06, PS-07, PS-12, RT-02, RT-03).

Planted defects: found **5 of 5**.

- FOUND FD-05 20% discount: The 20% restaurant discount over $25 never applies (HH-02)
- FOUND FD-06 empty form: Place Order with empty fields still places the order (PS-06)
- FOUND FD-09 LEARN10: 10% is taken from food and delivery ($1.59 / $15.85 instead of $1.30 / $16.14) (HH-05, HH-06, HH-07, PS-01, RT-02)
- FOUND FD-10 minimum: The minimum counts fees too, so $15.51 of food already passes (HH-03, RT-03)
- FOUND FD-11 favourites: Koliba u Jána loses its heart after a page reload (PS-12)

Failures not on the planted list (the app differs from the spec):

- F01 · Delivery Fee: PK-01 (expected $0.00, got $2.99), RT-02 (expected $1.99, got $2.99)
- F08 · text "Classic Beef Burger": PS-04 (expected shown, got missing)
- F08 · no Total Paid: PS-07 (expected not shown, got shown)

## learn (http://localhost:4173)

Run 9, passed 4, failed 5 (HH-02, PK-01, PS-04, PS-06, PS-07).

Planted defects: found **2 of 2**.

- FOUND FD-05 20% discount: The 20% restaurant discount over $25 never applies (HH-02)
- FOUND FD-06 empty form: Place Order with empty fields still places the order (PS-06)

Failures not on the planted list (the app differs from the spec):

- F01 · Delivery Fee: PK-01 (expected $0.00, got $2.99)
- F08 · text "Classic Beef Burger": PS-04 (expected shown, got missing)
- F08 · no Total Paid: PS-07 (expected not shown, got shown)

## bug (http://localhost:4175)

Run 9, passed 1, failed 8 (HH-01, HH-02, PK-01, PS-02, PS-04, PS-05, PS-06, PS-07).

Planted defects: found **5 of 5**.

- FOUND FD-05 20% discount: The 20% restaurant discount over $25 never applies (HH-02)
- FOUND FD-06 empty form: Place Order with empty fields still places the order (PS-06)
- FOUND M1 order number: FDR- + 5 lower-case characters (PS-02)
- FOUND M2 checkout with empty cart: Checkout with an empty cart shows the form (PS-05)
- FOUND M3 service fee: Service Fee $2.00 instead of $1.50 (HH-01, HH-02, PK-01)

Failures not on the planted list (the app differs from the spec):

- F01 · Delivery Fee: PK-01 (expected $0.00, got $2.99)
- F08 · text "Classic Beef Burger": PS-04 (expected shown, got missing)
- F08 · no Total Paid: PS-07 (expected not shown, got shown)
