# medusa-fulfillment-shiprocket

W.I.P. Shiprocket fulfillment plugin for MedusaJS

This plugin is inspired by Medusa's Official [Webshipper Plugin](https://github.com/medusajs/medusa/tree/cab5821f55cfa448c575a20250c918b7fc6835c9/packages/medusa-fulfillment-webshipper)

[Medusa Website](https://medusajs.com) | [Medusa Repository](https://github.com/medusajs/medusa) | [Shiprocket API](https://apidocs.shiprocket.in)

---
<br/>

## Features

- Shiprocket can be used as a shipping option during checkouts and for handling order fulfillment and returns.
- Sync order details and updates with Shiprocket.
- WIP: Listen to shipment status updates via webhooks
- WIP: Shipment tracking endpoints

---
<br/>

## Prerequisites

- [Medusa backend](https://docs.medusajs.com/development/backend/install)
- [Medusa admin](https://docs.medusajs.com/admin/quickstart)
- [Shiprocket Account](https://www.shiprocket.in/)
- You need to create one API User as mentioned in [Shiprocket docs](https://apidocs.shiprocket.in)

---
<br/>

## How to Install

1\. Run the following command in the directory of the Medusa backend:

```bash
npm install medusa-fulfillment-shiprocket
or
yarn add medusa-fulfillment-shiprocket
```

2\. Set the following environment variables in `.env`:

```bash
SHIPROCKET_CHANNEL_ID=<YOUR_SHIPROCKET_CHANNEL_ID>
SHIPROCKET_EMAIL=<YOUR_SHIPROCKET_EMAIL>
SHIPROCKET_PASSWORD=<YOUR_SHIPROCKET_PASSWORD>
```

3\. In `medusa-config.js` add the following at the end of the `plugins` array:

```js
const plugins = [
  // ...
  {
    resolve: `medusa-fulfillment-shiprocket`,
    options: {
      channel_id: process.env.SHIPROCKET_CHANNEL_ID, //(required)
      email: process.env.SHIPROCKET_EMAIL, //(required)
      password: process.env.SHIPROCKET_PASSWORD, //(required)
      token: "", //(required. leave empty)
      pricing: 'calculated', //"flat_rate" or "calculated" (required)
      length_unit: 'cm', //"mm", "cm" or "inches" (required)
      multiple_items: 'split_shipment', //"single_shipment" or "split_shipment"(default) (required)
      inventory_sync: false, //true or false(default) (required)
      forward_action: 'create_order', //'create_fulfillment' or 'create_order'(default) (required)
      return_action: 'create_order', //'create_fulfillment' or 'create_order'(default) (required)
    }
  },
]
```

---
<br/>

## Test the Plugin

1\. Run the following command in the directory of the Medusa backend to run the backend:

```bash
npm run start
```

2\. Enable the fulfillment provider in the admin. You can refer to [this User Guide](https://docs.medusajs.com/user-guide/regions/providers) to learn how to do that. Alternatively, you can use the [Admin APIs](https://docs.medusajs.com/api/admin#tag/Region/operation/PostRegionsRegion).

3\. Place an order using a storefront or the [Store APIs](https://docs.medusajs.com/api/store). You should be able to use the shiprocket fulfillment provider during checkout.

---
<br/>

## Units

Since Medusa requires product variant weight to be expressed in integer (decimals not allowed), it is assumed that your product variant weights are in grams.
If you are using any other unit then please change it to grams. 

You can specify the length units in mm, cm or inches depending on your preference and update the same in the plugin's "length_unit" option.

---
<br/>

## Pricing

1\. `pricing: flat_rate` - Use this if you want to charge a fixed shipping rate to your customers at checkout.

2\. `pricing: calculated` - Use this if your want to charge the actual shipping rate of the shipping option at checkout.

Don't forget to do the same when you add shipping options to your region in Medusa Admin.

---
<br/>

## Pass GSTIN

If you want to pass your customer's GSTIN to Shiprocket, please store it in the cart's metadata field as 'gstin'

```js
cart: {
  metadata: {
    "gstin": "XXXXXXX...",
  }
}
```

---
<br/>

## Quality checks on Return Shipment

If you want the courier to perform quality checks on return shipment at the time of pickup, you can pass the following in your item's metadata depending on the nature of quality check to be performed.

```js
cart: {
  items:[
    {
      id:"item_xxx",
      metadata:{
        qc: {
          qc_enable: true,
          qc_color: 'varchar(255)',
          qc_brand: 'varchar(255)',
          qc_serial_no: 'varchar(255)',
          qc_ean_barcode: 'varchar(255)',
          qc_size: 'varchar(255)',
          qc_product_name: 'varchar(255)',
          qc_product_image: 'varchar(255)',
        },
      }
    },
  ]
}
```

Note: If there are multiple items, quality check will be performed only on a single item. Which item? Shiprocket won't tell us.

---
<br/>

## Multiple shipments per order

Due to limitations in Shiprocket's API, it is currently not possible to create multiple shipments for a single order programatically. Sellers have to do it manually by enabling the "split shipment" feature in Settings > Shipping Features > Split Shipment and fulfilling the order as described in this [video](https://www.youtube.com/watch?v=7jpwOIquZtk).

To handle this limitation, this plugin lets you choose one of the following options when there are multiple items in your order to be fulfilled -

1\. `multiple_items: split_shipment`

Use this if you want to create a Shiprocket Order using this plugin and then create split shipments manually using Shiprocket's dashboard.
The actual weight passed to Shiprocket is the sum of actual weights of all the items in your cart.

2\. `multiple_items: single_shipment`

Use this if you are packing multiple order items in a single shipment. You can pass the overall dimensions and weight of your shipment in the cart's metadata with the following keys-
{
  shipment_length: 
  shipment_width: 
  shipment_height: 
  shipment_weight: 
}
If you don't pass the dimensions, then this plugin will choose the largest item and pass its dimensions to Shiprocket for volumetic weight calculations.
If you don't pass the shipment_weight, the actual weight passed to Shiprocket is the sum of actual weights of all the items in your cart. 

Most of the times, Shiprocket will use actual weight for rate calculation. However, if the volumetric weight is larger than actual weight, Shiprocket will use volumetric weight for rate calculations.

---
<br/>

## Forward Action

Determines what action this plugin will perform with Shiprocket when a forward fulfillment is created in Medusa.

1\. `forward_action: create_order`

When you click on "Create Fulfillment" > "Complete" button for your order in Medusa Admin, this plugin will create a shiprocket order. The remaining steps of generating multiple split shipments, requesting it's pickup, generating label and manifest will have to be done manually by the seller in Shiprocket's dashboard.

2\. `forward_action: create_fulfillment`

When you click on "Create Fulfillment" > "Complete" button for your order in Medusa Admin, this plugin creates a shiprocket order, generate shipment, request pickup and finally generates label and manifest using forward method in Shiprocket's [Wrapper API](https://apidocs.shiprocket.in/#6339172b-495f-4d2c-b1cf-2f8f493b6412).
This returns a response which contains awb_code and all other order, courier and shipment related details. You can view this data in Medusa Admin by expanding the Raw Order > fulfillments > 0 > data

If there are multiple items in your order and if multiple_items is set to `split_shipment` and forward_action is `create_fulfillment`, this plugin will throw an error because Shiprocket doesn't support creating split shipments via API.

After the product is shipped, you can mark the fulfillment as `shipped` in Medusa Admin. 

---
<br/>

## Return Action

Determines what action this plugin will perform with Shiprocket when a return request is raised via storefront or admin.

1\. `return_action: create_order`

When the customer or admin raises a return request, this plugin will create a shiprocket return order. The remaining steps of generating multiple split shipments, requesting it's pickup, generating label and manifest will have to be done manually by the seller in Shiprocket's dashboard.

2\. `return_action: create_fulfillment`

When the customer or admin raises a return request, this plugin creates a shiprocket return order, generate awb and request pickup using return method in Shiprocket's [Wrapper API](https://apidocs.shiprocket.in/#f7e603e2-9f1f-4c70-9530-b8d4dd79f32e).
This returns a response which contains awb_code and all other order, courier and shipment related details. You can view this data in Medusa Admin by expanding the Raw Order > returns > 0 > shipping_data

If there are multiple items in your order and if multiple_items is set to `split_shipment` and return_action is `create_fulfillment`, this plugin will throw an error because Shiprocket doesn't support creating split shipments via API.

After the product is received, you can mark it as `received` in Medusa Admin. 

---
<br/>

## Inventory Sync

`inventory_sync: true` - To sync your Medusa inventory with Shiprocket. This requires you to be on a monthly Shiprocket subscription plan.

---
<br/>

## Custom Functionality

If your buisness logic requires a different functionality than described as above, you need to modify shiprocket-fulfillment.js in ```/src/services``` and use the utility fuctions created in ```/src/utils```

---
<br/>

## Resources:

- Creating a fulfilment provider: https://docs.medusajs.com/advanced/backend/shipping/add-fulfillment-provider
- Fulfillment provider interface: https://github.com/medusajs/medusa/blob/master/packages/medusa-interfaces/src/fulfillment-service.js
- Example: Manual https://github.com/medusajs/medusa/blob/master/packages/medusa-fulfillment-manual
- Example: Webshipper https://github.com/medusajs/medusa/tree/master/packages/medusa-fulfillment-webshipper
- Example: Shippo https://github.com/macder/medusa-fulfillment-shippo

---
<br/>

## Donate 💜
Don't forget to [fund this project](https://ko-fi.com/hemann55) when it brings value to your buisness. Issues, feature requests and PRs are most welcome.
