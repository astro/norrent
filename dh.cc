#include <node.h>
#include <node_buffer.h>
extern "C" {
#include <openssl/dh.h>
}
#include <cstring>

using namespace v8;
using namespace node;


class DiffieHellman : public ObjectWrap {
public:
  static void Initialize(Handle<Object> target)
    {
      HandleScope scope;
      Local<FunctionTemplate> t1 = FunctionTemplate::New(New);
      Persistent<FunctionTemplate> t =
        Persistent<FunctionTemplate>::New(t1);
      t->InstanceTemplate()->SetInternalFieldCount(1);
      t->SetClassName(String::NewSymbol("DiffieHellman"));

      NODE_SET_PROTOTYPE_METHOD(t, "secretWrite", SecretWrite);
      NODE_SET_PROTOTYPE_METHOD(t, "secretLength", SecretLength);
      NODE_SET_PROTOTYPE_METHOD(t, "pubKeyWrite", PubKeyWrite);
      NODE_SET_PROTOTYPE_METHOD(t, "pubKeyLength", PubKeyLength);

      target->Set(String::NewSymbol("DiffieHellman"), t->GetFunction());
    }

protected:
  /*** Constructor ***/

  static Handle<Value> New(const Arguments& args)
    {
      HandleScope scope;

      if (args.Length() == 2 &&
          Buffer::HasInstance(args[0]) &&
          Buffer::HasInstance(args[1]))
      {
        Buffer *prime = ObjectWrap::Unwrap<Buffer>(args[0]->ToObject()),
          *generator = ObjectWrap::Unwrap<Buffer>(args[1]->ToObject());
        DiffieHellman *self = new DiffieHellman(prime, generator);
        self->Wrap(args.This());

        return args.This();
      }
      else
        return ThrowException(Exception::TypeError(String::New("Bad argument.")));
    }

  DiffieHellman(Buffer *prime, Buffer *generator)
    : dh(DH_new())
    {
      dh->p = BN_bin2bn(reinterpret_cast<unsigned char *>(prime->data()),
                        prime->length(), NULL);
      dh->g = BN_bin2bn(reinterpret_cast<unsigned char *>(generator->data()),
                        generator->length(), NULL);
      DH_generate_key(dh);
    }

  ~DiffieHellman()
    {
      DH_free(dh);
    }

  /*** secretLength() ***/

  static Handle<Value> SecretLength(const Arguments &args)
    {
      HandleScope scope;
      DiffieHellman *self = ObjectWrap::Unwrap<DiffieHellman>(args.This());
      return scope.Close(Integer::New(self->secretLength()));
    }

  int secretLength() const
    {
      return DH_size(dh);
    }

  /*** secretWrite() ***/

  static Handle<Value> SecretWrite(const Arguments &args)
    {
      HandleScope scope;

      if (args.Length() == 2 &&
          Buffer::HasInstance(args[0]) &&
          Buffer::HasInstance(args[1]))
      {
        DiffieHellman *self = ObjectWrap::Unwrap<DiffieHellman>(args.This());
        Buffer *pubkey = ObjectWrap::Unwrap<Buffer>(args[0]->ToObject()),
          *secretBuffer = ObjectWrap::Unwrap<Buffer>(args[1]->ToObject());
        if (self->secretWrite(pubkey, secretBuffer))
          return Null();
        else
          return ThrowException(Exception::TypeError(String::New("Buffer size mismatch.")));
      }
      else
        return ThrowException(Exception::TypeError(String::New("Bad argument.")));
    }

  bool secretWrite(Buffer *pubkey, Buffer *secretBuffer)
    {
      if (secretBuffer->length() == DH_size(dh))
      {
        BIGNUM *k = BN_bin2bn(reinterpret_cast<unsigned char *>(pubkey->data()),
                              pubkey->length(), NULL);
        unsigned char *secret = new unsigned char[DH_size(dh)];
        memset(secret, DH_size(dh), 0);

        DH_compute_key(secret, k, dh);
        memcpy(secretBuffer->data(), secret, DH_size(dh));

        BN_free(k);
        delete[] secret;

        return true;
      }
      else
        return false;
    }

  /*** pubKeyLength() ***/

  static Handle<Value> PubKeyLength(const Arguments &args)
    {
      HandleScope scope;
      DiffieHellman *self = ObjectWrap::Unwrap<DiffieHellman>(args.This());
      return scope.Close(Integer::New(self->pubKeyLength()));
    }

  int pubKeyLength() const
    {
      return BN_num_bytes(dh->pub_key);
    }

  /*** pubKeyWrite() ***/

  static Handle<Value> PubKeyWrite(const Arguments &args)
    {
      HandleScope scope;

      if (args.Length() == 1 &&
          Buffer::HasInstance(args[0]))
      {
        DiffieHellman *self = ObjectWrap::Unwrap<DiffieHellman>(args.This());
        Buffer *buffer = ObjectWrap::Unwrap<Buffer>(args[0]->ToObject());
        if (self->pubKeyWrite(buffer))
          return Null();
        else
          return ThrowException(Exception::TypeError(String::New("Buffer size mismatch.")));
      }
      else
        return False();
    }


  bool pubKeyWrite(Buffer *buffer) const
    {
      if (BN_num_bytes(dh->pub_key) == buffer->length())
      {
        BN_bn2bin(dh->pub_key, reinterpret_cast<unsigned char *>(buffer->data()));
        return true;
      }
      else
        return false;
    }

private:
  DH *dh;
};


extern "C" void init(Handle<Object> target)
{
  HandleScope scope;
  DiffieHellman::Initialize(target);
}
