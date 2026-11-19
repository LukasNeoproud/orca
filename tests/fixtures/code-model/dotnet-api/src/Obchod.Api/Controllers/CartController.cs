using Microsoft.AspNetCore.Mvc;
using Obchod.Application;
using Obchod.Domain;

namespace Obchod.Api.Controllers;

[ApiController]
[Route("api/cart")]
public sealed class CartController(CartService cartService) : ControllerBase
{
    [HttpGet]
    public Task<Cart> Get(CancellationToken cancellationToken) => cartService.GetCartAsync(cancellationToken);

    [HttpDelete("items/{itemId}")]
    public Task<Cart> RemoveItem([FromRoute] string itemId, CancellationToken cancellationToken) =>
        cartService.RemoveItemAsync(itemId, cancellationToken);
}
