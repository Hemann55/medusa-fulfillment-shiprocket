async function processShipmentData(
  order_items,
  length_unit,
  shipment_length,
  shipment_width,
  shipment_height,
  shipment_weight
) {
  let lengthInCM, widthInCM, heightInCM, shipmentWeight

  let sumOfWeights = 0

  let largestItem

  if (shipment_length && shipment_width && shipment_height && shipment_weight) {
    switch (length_unit) {
      case 'mm':
        lengthInCM = shipment_length / 10
        widthInCM = shipment_width / 10
        heightInCM = shipment_height / 10
        break
      case 'cm':
        lengthInCM = shipment_length
        widthInCM = shipment_width
        heightInCM = shipment_height
        break
      case 'inches':
        lengthInCM = shipment_length * 2.54
        widthInCM = shipment_width * 2.54
        heightInCM = shipment_height * 2.54
        break
      default:
        throw new Error(
          'Shiprocket: Please add a length_unit. Supported values are mm, cm, inches'
        )
    }

    shipmentWeight = shipment_weight
  } else {
    console.log(
      "Shiprocket: Item dimensions and weight not found in order's metadata. Using largest item's dimensions and sum of weights"
    )

    let volWeights = {}

    order_items.forEach((item) => {
      const { length, width, height, weight } = item.variant

      sumOfWeights += weight / 1000 //Shiprocket requires weight in KGS

      let volWeight

      switch (length_unit) {
        case 'mm':
          volWeight = (length * width * height) / (5000 * 1000)
          break
        case 'cm':
          volWeight = (length * width * height) / 5000
          break
        case 'inches':
          volWeight = (length * width * height * 16.387064) / 5000
          break
        default:
          throw new Error(
            'Shiprocket: Please add a length_unit. Supported values are mm, cm, inches'
          )
      }

      volWeights[item.id] = volWeight
    })

    const largestItemId = Object.keys(volWeights).reduce((a, b) =>
      volWeights[a] > volWeights[b] ? a : b
    )

    largestItem = order_items.find((item) => item.id === largestItemId)

    switch (length_unit) {
      case 'mm':
        lengthInCM = largestItem.variant.length / 10
        widthInCM = largestItem.variant.width / 10
        heightInCM = largestItem.variant.height / 10
        break
      case 'cm':
        lengthInCM = largestItem.variant.length
        widthInCM = largestItem.variant.width
        heightInCM = largestItem.variant.height
        break
      case 'inches':
        lengthInCM = largestItem.variant.length * 2.54
        widthInCM = largestItem.variant.width * 2.54
        heightInCM = largestItem.variant.height * 2.54
        break
      default:
        throw new Error(
          'Shiprocket: Please add a length_unit. Supported values are mm, cm, inches'
        )
    }

    shipmentWeight = sumOfWeights
  }

  return { lengthInCM, widthInCM, heightInCM, shipmentWeight }
}

export default processShipmentData
