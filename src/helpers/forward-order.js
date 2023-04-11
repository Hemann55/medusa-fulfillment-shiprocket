import { humanizeAmount } from 'medusa-core-utils'

async function forwardOrder(forwardData) {
  const {
    options,
    client,
    totalsService,
    courier_id,
    fulfillmentItems,
    fromOrder,
    billing_address,
    shipping_address,
    isCOD,
    gstin,
    lengthInCM,
    widthInCM,
    heightInCM,
    shipmentWeight,
    pickupLocations,
    getCountryDisplayName,
  } = forwardData

  let newOrder = {
    order_id: fromOrder.display_id,
    order_date: new Date().toISOString().split('T')[0],
    pickup_location: pickupLocations.shipping_address[0].pickup_location,
    channel_id: parseInt(options.channel_id),
    //comment:"",
    billing_customer_name: billing_address.first_name,
    billing_last_name: billing_address.last_name,
    billing_address: billing_address.address_1,
    billing_address_2: billing_address.address_2,
    billing_city: billing_address.city,
    billing_state: billing_address.province,
    billing_country: getCountryDisplayName(
      fromOrder.billing_address.country_code
    ),
    billing_pincode: parseInt(billing_address.postal_code),
    billing_email: fromOrder.email,
    billing_phone: parseInt(billing_address.phone),
    shipping_is_billing: false, //medusa does not store shipping_is_billing?
    shipping_customer_name: shipping_address.first_name,
    shipping_last_name: shipping_address.last_name,
    shipping_address: shipping_address.address_1,
    shipping_address_2: shipping_address.address_2,
    shipping_city: shipping_address.city,
    shipping_state: shipping_address.province,
    shipping_country: getCountryDisplayName(
      fromOrder.shipping_address.country_code
    ),
    shipping_pincode: parseInt(shipping_address.postal_code),
    shipping_email: fromOrder.email,
    shipping_phone: parseInt(shipping_address.phone),
    order_items: await Promise.all(
      fulfillmentItems.map(async (item) => {
        const totals = await totalsService.getLineItemTotals(item, fromOrder, {
          include_tax: true,
          use_tax_lines: true,
        })
        //console.log(`totals for ${item.title}`, totals)

        return {
          name: item.title,
          sku: item.variant.sku,
          units: item.quantity,
          selling_price: humanizeAmount(
            totals.original_total,
            fromOrder.currency_code
          ),
          // discount: humanizeAmount(
          //   totals.discount_total,
          //   fromOrder.currency_code
          // ),
          tax: totals.tax_lines.reduce((acc, next) => acc + next.rate, 0),
          hsn: parseInt(item.variant.hs_code),
        }
      })
    ),
    payment_method: !!isCOD ? 'COD' : 'Prepaid',
    shipping_charges: humanizeAmount(
      fromOrder.shipping_methods[0].price,
      fromOrder.currency_code
    ),
    //giftwrap_charges: '',
    //transaction_charges: '',
    total_discount: humanizeAmount(
      fromOrder.discount_total,
      fromOrder.currency_code
    ),
    sub_total: humanizeAmount(
      fromOrder.items.reduce((acc, item) => acc + item.original_total, 0),
      fromOrder.currency_code
    ),
    //ewaybill_no: "",
    //invoice_number: "",
    //order_type: "",
    //checkout_shipping_method:""
    length: lengthInCM,
    breadth: widthInCM,
    height: heightInCM,
    weight: shipmentWeight,
  }

  if (gstin) {
    newOrder.customer_gstin = gstin
  }

  //console.log('newOrder', newOrder)

  //throw new Error('Not implemented yet')

  let response

  if (options.inventory_sync) {
    response = await client.orders.createForChannel(newOrder)
  } else {
    response = await client.orders.createCustom(newOrder)
  }

  console.log('Shiprocket: newOrder response', response)

  return response
}

export default forwardOrder
