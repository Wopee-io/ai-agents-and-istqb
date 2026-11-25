# FoodDash: tests from the fact card

Generated from `fact-card.json` (sha256 `c9581f4d7057…`) by `generate.mjs`. No model, no randomness: same card = same tests.

**23 tests**: 22 ready, 1 blocked by a question. By technique: boundary values (3-value) 7, decision table 3, each parameter value 1, state transitions 12.

Per build: learn 9, battle 22, bug 9 (FD-09 to FD-11 exist only in the newer battle build).

## Boundary values: what the code wanted and what the menu allows

**F04 Restaurant discount 20% over $25** (Burger Palace; discount when subtotal > $25). A value the menu cannot build is replaced by the nearest cart on the same side of the boundary. Above the boundary, only carts where 20% comes out in whole cents (Q4).

| wanted value | side | cart used |
| --- | --- | --- |
| $24.99 | no discount | not possible, nearest $24.98 |
| $25.00 | no discount | not possible, nearest $24.98 |
| $25.01 | discount applies | not possible, nearest $25.45 |

**F09 Minimum order** (Sushi Masters; checkout when food subtotal ≥ $20.00). The menu cannot build $19.99, $20.00, $20.01. The code takes the nearest carts on both sides.

| wanted value | side | cart used |
| --- | --- | --- |
| $19.99 | checkout blocked | not possible, nearest $19.98 |
| $20.00 | checkout allowed | not possible, nearest $20.97 |
| $20.01 | checkout allowed | not possible, nearest $20.97 |

**F06 LEARN10 discount rounding** ((picked by the code: smallest cart with no other discount); round to cents, halves up). Rounding boundary: x.xx4 down, x.xx5 up, x.xx6 up.

| wanted value | side | cart used |
| --- | --- | --- |
| third decimal 4 | down | $16.94 → $1.694 → $1.69 |
| third decimal 5 | up | $12.95 → $1.295 → $1.30 |
| third decimal 6 | up | $15.96 → $1.596 → $1.60 |

## Decision table: discounts × minimum order

| rule | 20% discount applies | LEARN10 | minimum | result |
| --- | --- | --- | --- | --- |
| R1 | yes | yes | none | question Q1 (RT-01) |
| R2 | yes | yes | met | not possible: no restaurant in the data has both the 20% discount and a minimum |
| R3 | yes | yes | not met | not possible: no restaurant in the data has both the 20% discount and a minimum |
| R4 | yes | no | none | covered (HH-02) |
| R5 | yes | no | met | not possible: no restaurant in the data has both the 20% discount and a minimum |
| R6 | yes | no | not met | not possible: no restaurant in the data has both the 20% discount and a minimum |
| R7 | no | yes | none | covered (HH-06) |
| R8 | no | yes | met | new test (RT-02) |
| R9 | no | yes | not met | new test (RT-03) |
| R10 | no | no | none | covered (HH-01) |
| R11 | no | no | met | covered (HH-04) |
| R12 | no | no | not met | covered (HH-03) |

## Open questions for the analyst

- **Q1** (open: the spec is silent, question for the analyst): Does the 20% restaurant discount (over $25) stack with the code LEARN10? If so, in what order, and is the $25 boundary checked before or after the code discount? Decision table: the spec gives no result for the combination "restaurant discount applies × LEARN10 applied".
- **Q2** (reading to confirm): Does the 20% discount also apply to an order of exactly $25.00? The text says "over $25" and "once it passes $25", so the card uses "more than $25". This is the value exactly on the boundary. Also, $25.00 cannot be built from the Burger Palace menu, so there is no test on the boundary yet.
- **Q3** (open): What do the offers "20% off your first order" (Koliba u Jána) and "Free dessert with orders over $30" (Mediterranean Delight) mean? The spec only defines "20% OFF orders over $25". A "first order" makes no sense without an account. The app shows them on the cards, but there is no rule for them. The generator leaves these restaurants out of the price tests.
- **Q4** (open): How is the 20% restaurant discount rounded? The spec gives the "halves up" rule only for LEARN10. So for the 20% discount the generator only picks carts where the discount comes out in whole cents.

## Tests

### HH-01 · 20% discount: cart below the $25 boundary ($24.98)

- **Technique:** boundary values (3-value); decision table (R10)
- **Fact:** F04 Restaurant discount 20% over $25 (FD-05)
- **Build:** learn, battle, bug
- **Steps:** Open the restaurant Burger Palace. Add 1× Double Smash Burger (Burgers tab). Add 1× Truffle Fries (Sides tab). Open the cart.
- **Expected result (computed by code):** No discount. Subtotal $24.98, Delivery Fee $2.99, Service Fee $1.50, no discount, Total $29.47

### HH-02 · 20% discount: cart above the $25 boundary ($25.45)

- **Technique:** boundary values (3-value); decision table (R4)
- **Fact:** F04 Restaurant discount 20% over $25 (FD-05)
- **Build:** learn, battle, bug
- **Steps:** Open the restaurant Burger Palace. Add 1× Onion Rings (Sides tab). Add 3× Classic Lemonade (Drinks tab). Add 1× Milkshake (Drinks tab). Open the cart.
- **Expected result (computed by code):** Restaurant discount −$5.09 (20% of $25.45). Subtotal $25.45, Delivery Fee $2.99, Service Fee $1.50, restaurant discount 20% −$5.09, Total $24.85

### HH-03 · Minimum order $20: cart just below the boundary ($19.98)

- **Technique:** boundary values (3-value); decision table (R12)
- **Fact:** F09 Minimum order (FD-10)
- **Build:** battle
- **Steps:** Open the restaurant Sushi Masters. Add 1× California Roll (Sushi Rolls tab). Add 1× Tuna Nigiri (2pc) (Nigiri tab). Open the cart.
- **Expected result (computed by code):** The cart shows "Add $0.02 more to order from Sushi Masters" (the gap to the food subtotal; fees do not count) and offers no Proceed to Checkout.

### HH-04 · Minimum order $20: cart above the boundary ($20.97)

- **Technique:** boundary values (3-value); decision table (R11)
- **Fact:** F09 Minimum order (FD-10)
- **Build:** battle
- **Steps:** Open the restaurant Sushi Masters. Add 3× Salmon Nigiri (2pc) (Nigiri tab). Open the cart. Proceed to Checkout.
- **Expected result (computed by code):** No minimum message. Proceed to Checkout is there and checkout shows the form.

### HH-05 · LEARN10 rounding: 10% of $16.94 = $1.694 → $1.69 (down)

- **Technique:** boundary values (3-value)
- **Fact:** F05 Promo code LEARN10 (FD-09); F06 LEARN10 discount rounding (FD-09)
- **Build:** battle
- **Steps:** Open the restaurant Burger Palace. Add 1× Classic Beef Burger (Burgers tab). Add 1× Classic Lemonade (Drinks tab). Open the cart. Proceed to Checkout. Enter the code LEARN10 and click Apply.
- **Expected result (computed by code):** Promo LEARN10 line −$1.69. Subtotal $16.94, Delivery Fee $2.99, Service Fee $1.50, Promo LEARN10 −$1.69, Total $19.74

### HH-06 · LEARN10 rounding: 10% of $12.95 = $1.295 → $1.30 (up)

- **Technique:** boundary values (3-value); decision table (R7)
- **Fact:** F05 Promo code LEARN10 (FD-09); F06 LEARN10 discount rounding (FD-09); F04 Restaurant discount 20% over $25 (FD-05)
- **Build:** battle
- **Steps:** Open the restaurant Burger Palace. Add 1× Classic Beef Burger (Burgers tab). Open the cart. Proceed to Checkout. Enter the code LEARN10 and click Apply.
- **Expected result (computed by code):** Promo LEARN10 line −$1.30. Subtotal $12.95, Delivery Fee $2.99, Service Fee $1.50, Promo LEARN10 −$1.30, Total $16.14

### HH-07 · LEARN10 rounding: 10% of $15.96 = $1.596 → $1.60 (up)

- **Technique:** boundary values (3-value)
- **Fact:** F05 Promo code LEARN10 (FD-09); F06 LEARN10 discount rounding (FD-09)
- **Build:** battle
- **Steps:** Open the restaurant Burger Palace. Add 4× Classic Lemonade (Drinks tab). Open the cart. Proceed to Checkout. Enter the code LEARN10 and click Apply.
- **Expected result (computed by code):** Promo LEARN10 line −$1.60. Subtotal $15.96, Delivery Fee $2.99, Service Fee $1.50, Promo LEARN10 −$1.60, Total $18.85

### RT-01 · 20% discount and LEARN10 together: the spec is silent

- **Technique:** decision table
- **Fact:** F04 Restaurant discount 20% over $25 (FD-05); F05 Promo code LEARN10 (FD-09)
- **Build:** — · **BLOCKED by question Q1**
- **Steps:** No test until the analyst answers Q1.
- **Expected result (computed by code):** Unknown: Does the 20% restaurant discount (over $25) stack with the code LEARN10? If so, in what order, and is the $25 boundary checked before or after the code discount?

### RT-02 · Sushi Masters above the minimum + LEARN10

- **Technique:** decision table (R8)
- **Fact:** F05 Promo code LEARN10 (FD-09); F09 Minimum order (FD-10)
- **Build:** battle
- **Steps:** Open the restaurant Sushi Masters. Add 3× Salmon Nigiri (2pc) (Nigiri tab). Open the cart. Proceed to Checkout. Enter the code LEARN10 and click Apply.
- **Expected result (computed by code):** Subtotal $20.97, Delivery Fee $1.99, Service Fee $1.50, Promo LEARN10 −$2.10, Total $22.36. The minimum uses the food subtotal, so checkout works.

### RT-03 · Sushi Masters below the minimum + LEARN10: checkout shows a message instead of the form

- **Technique:** decision table (R9)
- **Fact:** F05 Promo code LEARN10 (FD-09); F09 Minimum order (FD-10)
- **Build:** battle
- **Steps:** Open the restaurant Sushi Masters. Add 1× California Roll (Sushi Rolls tab). Add 1× Tuna Nigiri (2pc) (Nigiri tab). Open the cart. Go to /checkout inside the app, without a button.
- **Expected result (computed by code):** Checkout shows "Add $0.02 more to order from Sushi Masters" instead of the form. There is no form and no code field, so the code cannot be applied.

### PK-01 · Delivery "Free" counts as $0.00 (Pizza Corner)

- **Technique:** each parameter value
- **Fact:** F01 Delivery fee (FD-05)
- **Build:** learn, battle, bug
- **Steps:** Open the restaurant Pizza Corner. Add 1× Panna Cotta (Desserts tab). Open the cart.
- **Expected result (computed by code):** Subtotal $7.99, Delivery Fee $0.00, Service Fee $1.50, no discount, Total $9.49

### PS-01 · Promo code: apply with an unknown code → apply with the code in lower case → apply again → remove

- **Technique:** state transitions
- **Fact:** F05 Promo code LEARN10 (FD-09); F07 Promo code at checkout (FD-09)
- **Build:** battle
- **Steps:** Open the restaurant Burger Palace. Add 1× Classic Beef Burger (Burgers tab). Open the cart. Proceed to Checkout. Enter the code LEARN11 and click Apply. Enter the code learn10 and click Apply. Enter the code LEARN10 and click Apply. Remove the code (Remove).
- **Expected result (computed by code):** Unknown code: "This code is not valid", no discount. learn10: one discount −$1.30, Total $16.14. Second Apply: still one discount. Remove: no discount, Total $17.44.

### PS-02 · The order goes through all five stages in order and never leaves Delivered

- **Technique:** state transitions
- **Fact:** F08 Order lifecycle (FD-05, FD-06, FD-07); F03 Total price (FD-05)
- **Build:** learn, battle, bug
- **Steps:** Speed up time (test clock). Open the restaurant Burger Palace. Add 1× Classic Beef Burger (Burgers tab). Open the cart. Proceed to Checkout. Fill in all required fields. Place Order. Track My Order.
- **Expected result (computed by code):** Order Confirmed!, order number ^FDR-[A-Z0-9]{6}$, Total $17.44. Tracking shows Total Paid $17.44 and the stages Order Confirmed → Preparing → Ready for Pickup → On the Way → Delivered in this order, none skipped, no going back.

### PS-03 · Cart: add food → remove the last item

- **Technique:** state transitions
- **Fact:** F08 Order lifecycle (FD-05, FD-06, FD-07)
- **Build:** learn, battle, bug
- **Steps:** Open the restaurant Burger Palace. Add 1× Classic Beef Burger (Burgers tab). Open the cart. Remove Classic Beef Burger from the cart.
- **Expected result (computed by code):** An empty cart offers no Proceed to Checkout.

### PS-04 · Cart: add food → reload the page

- **Technique:** state transitions
- **Fact:** F08 Order lifecycle (FD-05, FD-06, FD-07)
- **Build:** learn, battle, bug
- **Steps:** Open the restaurant Burger Palace. Add 1× Classic Beef Burger (Burgers tab). Reload the page. Open the cart.
- **Expected result (computed by code):** After a page reload, Classic Beef Burger is still in the cart.

### PS-05 · Forbidden transition: Empty cart → open checkout

- **Technique:** state transitions
- **Fact:** F08 Order lifecycle (FD-05, FD-06, FD-07)
- **Build:** learn, battle, bug
- **Steps:** Open the URL /checkout.
- **Expected result (computed by code):** Checkout with an empty cart shows an empty state, no form and no Place Order.

### PS-06 · Forbidden transition: Checkout → Place Order with empty required fields

- **Technique:** state transitions
- **Fact:** F08 Order lifecycle (FD-05, FD-06, FD-07)
- **Build:** learn, battle, bug
- **Steps:** Open the restaurant Burger Palace. Add 1× Classic Beef Burger (Burgers tab). Open the cart. Proceed to Checkout. Place Order.
- **Expected result (computed by code):** No order is placed: no Order Confirmed!, the customer stays on the form (required: Full Name, Street Address, City, Phone Number).

### PS-07 · Forbidden transition: Empty cart → track an order that was never placed

- **Technique:** state transitions
- **Fact:** F08 Order lifecycle (FD-05, FD-06, FD-07)
- **Build:** learn, battle, bug
- **Steps:** Open the URL /order/FDR-ZZZZZZ.
- **Expected result (computed by code):** No tracking page is shown for FDR-ZZZZZZ.

### PS-08 · Favourites: Burger Palace add → reload the page → remove

- **Technique:** state transitions
- **Fact:** F10 Favourite restaurants (FD-11)
- **Build:** battle
- **Steps:** Open the URL /. Click the heart on Burger Palace. Reload the page. Click the heart on Burger Palace.
- **Expected result (computed by code):** The heart switches to "Remove Burger Palace from favourites", the card does not open, it stays a favourite after a page reload, and a second click removes it.

### PS-09 · Favourites: Pizza Corner add → reload the page → remove

- **Technique:** state transitions
- **Fact:** F10 Favourite restaurants (FD-11)
- **Build:** battle
- **Steps:** Open the URL /. Click the heart on Pizza Corner. Reload the page. Click the heart on Pizza Corner.
- **Expected result (computed by code):** The heart switches to "Remove Pizza Corner from favourites", the card does not open, it stays a favourite after a page reload, and a second click removes it.

### PS-10 · Favourites: Sushi Masters add → reload the page → remove

- **Technique:** state transitions
- **Fact:** F10 Favourite restaurants (FD-11)
- **Build:** battle
- **Steps:** Open the URL /. Click the heart on Sushi Masters. Reload the page. Click the heart on Sushi Masters.
- **Expected result (computed by code):** The heart switches to "Remove Sushi Masters from favourites", the card does not open, it stays a favourite after a page reload, and a second click removes it.

### PS-11 · Favourites: Mediterranean Delight add → reload the page → remove

- **Technique:** state transitions
- **Fact:** F10 Favourite restaurants (FD-11)
- **Build:** battle
- **Steps:** Open the URL /. Click the heart on Mediterranean Delight. Reload the page. Click the heart on Mediterranean Delight.
- **Expected result (computed by code):** The heart switches to "Remove Mediterranean Delight from favourites", the card does not open, it stays a favourite after a page reload, and a second click removes it.

### PS-12 · Favourites: Koliba u Jána add → reload the page → remove

- **Technique:** state transitions
- **Fact:** F10 Favourite restaurants (FD-11)
- **Build:** battle
- **Steps:** Open the URL /. Click the heart on Koliba u Jána. Reload the page. Click the heart on Koliba u Jána.
- **Expected result (computed by code):** The heart switches to "Remove Koliba u Jána from favourites", the card does not open, it stays a favourite after a page reload, and a second click removes it.
