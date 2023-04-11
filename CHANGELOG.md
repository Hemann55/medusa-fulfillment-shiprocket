# Change Log

All notable changes in the NPM versions of this project will be documented in this file.
<br/>
This project will follow NPM's [Semantic Versioning](https://docs.npmjs.com/about-semantic-versioning)
<br/>
WIP plugin versions will be named 0.X.X. Tested production version naming will start from 1.0.0
<br/>
SR: Shiprocket
<br/>
<br/>

## V.0.1.0

Refactored large services file into smaller helper functions.

Fixed an important bug in volumetric weight calculations (length_unit was not considered when passing data to SR).

Previously, this plugin used to throw an error when multiple_items was set to `split_shipment` and forward_action/reverse-action to `create_fulfillment`. Now it will create a SR Order using the largest cart item's dimensions.
Also, it will warn you in console that even if forward_action/reverse-action is set to `create_fulfillment`, it is currently not possible to create fulfillment for multiple split shipments due to limitations in SR's API and that it is creating a SR Order instead. The remaining steps will have to be done manually in SR's dashboard.

---

<br/>

## V.0.0.3

Fixed gstin related bug, improved documentation

---

<br/>

## V.0.0.2

Removed redundant plugin options, generate SR token on startup

---
