using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Localization;
using Obchod.Application;
using Obchod.Domain;

namespace Obchod.Api.Controllers;

public sealed record CreateOrderRequest(PaymentMethod PaymentMethod);

[ApiController]
[Authorize]
[Route("api/[controller]")]
public sealed class OrdersController(CartService cartService, IStringLocalizer<Messages> messages) : ControllerBase
{
    [HttpPost]
    [ProducesResponseType<Order>(StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<Order>> Create([FromBody] CreateOrderRequest request, CancellationToken cancellationToken)
    {
        try
        {
            var order = await cartService.PlaceOrderAsync(request.PaymentMethod, cancellationToken);
            return Created($"api/orders/{order.Id}", order);
        }
        catch (EmptyCartException)
        {
            return Conflict(messages["CartEmpty"].Value);
        }
    }

    [HttpGet("{orderId}")]
    [AllowAnonymous]
    public ActionResult<string> Status(string orderId) => Ok(messages["OrderPlaced", orderId].Value);
}
